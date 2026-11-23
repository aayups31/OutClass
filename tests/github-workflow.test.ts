import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
vi.mock("../src/server/github", () => ({
  prepareGithub: vi.fn().mockResolvedValue("learner"),
}));
vi.mock("../src/server/git", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/server/git")>();
  return { ...actual, connectRemote: vi.fn(), push: vi.fn(), run: vi.fn() };
});
import * as git from "../src/server/git";
import { Application } from "../src/server/application";
import { Store } from "../src/server/store";
let directory: string, repo: string, store: Store, app: Application;
const remote = "https://github.com/learner/learning.git";
beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(git.connectRemote).mockResolvedValue(remote);
  vi.mocked(git.push).mockResolvedValue(undefined);
  vi.mocked(git.run).mockResolvedValue("");
  directory = await realpath(
    await mkdtemp(path.join(tmpdir(), "gitlearn-github-flow-")),
  );
  store = new Store(path.join(directory, "data"));
  app = new Application(store);
  repo = path.join(directory, "history");
  await app.setup(repo, false);
});
afterEach(async () => {
  store.close();
  await rm(directory, { recursive: true, force: true });
});
async function checkpoint(id: string) {
  app.observe({
    eventId: `event-${id}`,
    courseId: id,
    title: `Course ${id}`,
    url: `https://www.udemy.com/course/${id}/learn/lecture/1`,
    lessons: [{ id: "1", title: "First lesson", section: "Basics", order: 0 }],
  });
  await app.mirror(id);
  await app.start(id, "1");
  await writeFile(
    path.join(store.state().session!.workspace, "main.py"),
    `print('Course ${id}')\n`,
  );
  const preview = await app.preview();
  await app.commit(preview.id, preview.message);
}
it("creates one explicitly private repository and connects the parent archive", async () => {
  await app.createRemote("learning");
  expect(git.run).toHaveBeenCalledWith("gh", [
    "repo",
    "create",
    "learning",
    "--private",
    "--description",
    "My code, notes, and learning checkpoints",
  ]);
  expect(git.connectRemote).toHaveBeenCalledWith(
    repo,
    "https://github.com/learner/learning",
  );
  expect(git.push).not.toHaveBeenCalled();
  expect(store.state().settings.remote).toBe(remote);
});
it("syncs the shared archive once and marks checkpoints from every course synced", async () => {
  await checkpoint("first");
  await checkpoint("second");
  await app.remote(remote);
  expect(store.state().checkpoints.map((item) => item.sync)).toEqual([
    "pending",
    "pending",
  ]);
  await app.sync();
  expect(git.push).toHaveBeenCalledExactlyOnceWith(repo, remote);
  expect(store.state().checkpoints.map((item) => item.sync)).toEqual([
    "synced",
    "synced",
  ]);
  const tree = await git.git(repo, ["ls-tree", "-r", "--name-only", "HEAD"]);
  for (const course of store.state().courses)
    expect(tree).toContain(`${course.path}/${course.lessons[0].path}/main.py`);
});
it("leaves a local checkpoint pending when the remote push fails", async () => {
  await checkpoint("first");
  await app.remote(remote);
  const sha = store.state().checkpoints[0].sha;
  vi.mocked(git.push).mockRejectedValueOnce(new Error("Network unavailable"));
  await expect(app.sync()).rejects.toThrow("Network unavailable");
  expect(store.state().checkpoints[0]).toMatchObject({ sha, sync: "pending" });
  expect(await git.head(repo)).toBe(sha);
});
