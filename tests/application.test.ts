import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  realpath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Application } from "../src/server/application";
import { Store } from "../src/server/store";
import { git, head } from "../src/server/git";
import { collect, child, sanitizeUdemyUrl, scan } from "../src/server/safety";
import type { PublicPreview as Preview } from "../src/shared";

let directory: string;
let app: Application;
let store: Store;
let repo: string;
const observation = () => ({
  eventId: randomUUID(),
  courseId: "cpp-masterclass",
  title: "C++ Masterclass",
  url: "https://www.udemy.com/course/cpp-masterclass/learn/lecture/42?token=remove#overview",
  currentLessonId: "42",
  lessons: [
    {
      id: "42",
      title: "Dynamic Memory",
      section: "Pointers",
      sectionId: "8",
      order: 0,
    },
    {
      id: "43",
      title: "Smart Pointers",
      section: "Pointers",
      sectionId: "8",
      order: 1,
    },
  ],
});
beforeEach(async () => {
  directory = await realpath(
    await mkdtemp(path.join(tmpdir(), "gitlearn-test-")),
  );
  store = new Store(path.join(directory, "data"));
  app = new Application(store);
  repo = path.join(directory, "history");
  await app.setup(repo, false);
  app.observe(observation());
});
afterEach(async () => {
  store.close();
  await rm(directory, { recursive: true, force: true });
});
async function session() {
  await app.mirror("cpp-masterclass");
  await app.start("cpp-masterclass", "42");
  return store.state().session!;
}
async function save(preview: Preview) {
  return app.commit(preview.id, preview.message);
}

describe("Udemy to local history", () => {
  it("keeps multiple courses in one parent Git archive with separate automatic workspaces", async () => {
    await app.mirror("cpp-masterclass");
    await app.start("cpp-masterclass", "42");
    const first = store.state().session!;
    await writeFile(
      path.join(first.workspace, "main.cpp"),
      "int main() { return 0; }\n",
    );
    await save(await app.preview());
    app.observe({
      ...observation(),
      courseId: "second-course",
      title: "Python Practice",
      lessons: [{ id: "42", title: "Functions", section: "Basics", order: 0 }],
    });
    await app.mirror("second-course");
    await app.start("second-course", "42");
    const second = store.state().session!;
    await writeFile(
      path.join(second.workspace, "main.py"),
      "print('Learning')\n",
    );
    await save(await app.preview());
    const files = await git(repo, ["ls-tree", "-r", "--name-only", "HEAD"]);
    expect(first.destination).not.toBe(second.destination);
    expect(files).toContain(`${first.destination}/main.cpp`);
    expect(files).toContain(`${second.destination}/main.py`);
    expect(first.workspace).toContain(
      `${path.sep}workspaces${path.sep}udemy${path.sep}`,
    );
    expect(second.workspace).toContain(
      `${path.sep}workspaces${path.sep}udemy${path.sep}`,
    );
    expect(store.state().checkpoints).toHaveLength(2);
    expect(await git(repo, ["rev-list", "--count", "HEAD"])).toBe("2");
  });
  it("mirrors stable lesson identities and preserves partial curriculum and learner files", async () => {
    await app.mirror("cpp-masterclass");
    const first = store.state().courses[0];
    const allocated = first.lessons[0].path;
    const workspace = app.workspace(store.state(), first, first.lessons[0]);
    await writeFile(
      path.join(workspace, "notes.md"),
      "My original explanation.",
    );
    app.observe({
      ...observation(),
      title: "Renamed course",
      lessons: [
        {
          id: "42",
          title: "Renamed lesson",
          section: "New section name",
          sectionId: "8",
          order: 7,
        },
      ],
    });
    await app.mirror("cpp-masterclass");
    const updated = store.state().courses[0];
    expect(updated.lessons).toHaveLength(2);
    expect(updated.lessons[0].path).toBe(allocated);
    expect(updated.path).toBe(first.path);
    expect(await readFile(path.join(workspace, "notes.md"), "utf8")).toBe(
      "My original explanation.",
    );
    expect(updated.url).not.toContain("token");
    expect(updated.url).not.toContain("#");
  });
  it("records a real source file, notes, course metadata and commit, without changing source edits", async () => {
    const current = await session();
    await writeFile(
      path.join(current.workspace, "main.cpp"),
      "int main() { return 0; }\n",
    );
    await app.saveNote("I practiced allocating memory.");
    const preview = (await app.preview()) as Preview;
    expect(preview.aiUsed).toBe(false);
    const checkpoint = await save(preview);
    expect(checkpoint.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(
      await git(repo, [
        "show",
        `${checkpoint.sha}:${current.destination}/main.cpp`,
      ]),
    ).toBe("int main() { return 0; }");
    expect(store.state().session).toBeNull();
    expect(checkpoint.sync).toBe("local");
    expect(await git(repo, ["status", "--porcelain"])).toBe("");
    expect(
      await readFile(path.join(current.workspace, "main.cpp"), "utf8"),
    ).toBe("int main() { return 0; }\n");
  });
  it("saves exactly the reviewed bytes when the learner edits the source after preview", async () => {
    const current = await session();
    const source = path.join(current.workspace, "main.py");
    await writeFile(source, 'print("reviewed")\n');
    const preview = (await app.preview()) as Preview;
    await writeFile(source, 'print("newer work")\n');
    const checkpoint = await save(preview);
    expect(
      await git(repo, [
        "show",
        `${checkpoint.sha}:${current.destination}/main.py`,
      ]),
    ).toBe('print("reviewed")');
    expect(await readFile(source, "utf8")).toBe('print("newer work")\n');
  });
  it("makes no fabricated no-code checkpoint for empty generated notes", async () => {
    await session();
    await expect(app.preview()).rejects.toThrow("No new code or notes");
  });
  it("preserves a theory session using only the actual learner note", async () => {
    const current = await session();
    await app.saveNote("A unique pointer represents exclusive ownership.");
    const preview = (await app.preview()) as Preview;
    const record = await save(preview);
    const note = await git(repo, [
      "show",
      `${record.sha}:${current.destination}/session-notes/${current.id}.md`,
    ]);
    expect(note).toContain("exclusive ownership");
    expect(note).not.toContain("mastered");
  });
  it("ignores environment files, dependencies, and build output before capture", async () => {
    const current = await session();
    await writeFile(
      path.join(current.workspace, ".env"),
      "OPENAI_API_KEY=sk-not-for-capture-12345678901234567890",
    );
    await mkdir(path.join(current.workspace, "node_modules"));
    await writeFile(
      path.join(current.workspace, "node_modules", "private.txt"),
      "secret material",
    );
    await writeFile(path.join(current.workspace, "code.py"), "print(1)");
    const files = (await collect(current.workspace)).files;
    expect(files.map((file) => file.path)).not.toContain(".env");
    const preview = (await app.preview()) as Preview;
    expect(preview.diff).not.toContain("sk-not-for-capture");
    expect(
      preview.changes.some((change) => change.path.includes("node_modules")),
    ).toBe(false);
  });
  it("blocks secrets in learner code and notes without exposing their values", async () => {
    const current = await session();
    const secret = "sk-proj-" + "a".repeat(40);
    await writeFile(
      path.join(current.workspace, "unsafe.py"),
      `value = "${secret}"`,
    );
    await expect(app.preview()).rejects.toThrow("API key");
    expect(store.state().checkpoints).toHaveLength(0);
    await expect(app.saveNote(secret)).rejects.toThrow("API key");
  });
  it("rejects Git changes after review and leaves the source and staged content alone", async () => {
    const current = await session();
    await writeFile(path.join(current.workspace, "main.py"), "print(1)");
    const preview = (await app.preview()) as Preview;
    await git(repo, ["add", "--", "README.md", ".gitignore"]);
    await git(repo, ["commit", "-m", "Unrelated initial commit"]);
    const external = await head(repo);
    await expect(save(preview)).rejects.toThrow("repository changed");
    expect(await head(repo)).toBe(external);
    expect(store.state().session).not.toBeNull();
  });
  it("pauses instead of swallowing unrelated staging", async () => {
    const current = await session();
    await writeFile(path.join(current.workspace, "main.py"), "print(1)");
    await git(repo, ["add", "--", "README.md"]);
    const staged = await git(repo, ["diff", "--cached"]);
    await expect(app.preview()).rejects.toThrow("outside OutClass");
    expect(await git(repo, ["diff", "--cached"])).toBe(staged);
  });
  it("requires another review if the managed repository switches branches", async () => {
    const current = await session();
    await writeFile(path.join(current.workspace, "main.py"), "print(1)");
    await save((await app.preview()) as Preview);
    await app.start("cpp-masterclass", "42");
    await writeFile(path.join(current.workspace, "main.py"), "print(2)");
    const preview = (await app.preview()) as Preview;
    await git(repo, ["switch", "-c", "another-branch"]);
    await expect(save(preview)).rejects.toThrow("repository changed");
    expect(store.state().session).not.toBeNull();
  });
  it("does not mutate an existing source repository", async () => {
    await app.mirror("cpp-masterclass");
    const source = path.join(directory, "existing-source");
    await mkdir(source);
    await git(source, ["init"]);
    await writeFile(path.join(source, "main.py"), "print(2)");
    await git(source, ["add", "main.py"]);
    const before = await git(source, ["status", "--porcelain"]);
    await app.start("cpp-masterclass", "42", source);
    await save((await app.preview()) as Preview);
    expect(await git(source, ["status", "--porcelain"])).toBe(before);
    expect(await head(source)).toBe("");
  });
  it("deduplicates browser events across a persistent restart", () => {
    const event = observation();
    app.observe(event);
    store.close();
    store = new Store(path.join(directory, "data"));
    app = new Application(store);
    app.observe(event);
    expect(store.state().courses).toHaveLength(1);
    expect(store.state().courses[0].lessons).toHaveLength(2);
  });
  it("recovers a crash after ref advancement without creating a duplicate commit", async () => {
    const current = await session();
    await writeFile(path.join(current.workspace, "main.py"), "print(1)");
    const preview = (await app.preview()) as Preview;
    const raw = store.preview(preview.id)!;
    const { tree, commitTree } = await import("../src/server/git");
    const built = await tree(repo, raw.expectedHead, raw.files);
    const record = {
      id: raw.id,
      sessionId: raw.sessionId,
      courseId: current.courseId,
      courseTitle: current.courseTitle,
      lessonTitle: current.lessonTitle,
      timestamp: new Date().toISOString(),
      message: raw.message,
      sha: "",
      files: raw.changes.map((item) => item.path),
      sync: "local" as const,
    };
    store.put("commitJournal", {
      record,
      files: raw.files,
      expectedHead: raw.expectedHead,
    });
    const sha = await commitTree(
      repo,
      raw.expectedHead,
      built.treeId,
      raw.message,
      raw.id,
    );
    store.close();
    store = new Store(path.join(directory, "data"));
    app = new Application(store);
    await app.recover();
    await app.recover();
    expect(store.state().checkpoints).toHaveLength(1);
    expect(store.state().checkpoints[0].sha).toBe(sha);
    expect(store.state().session).toBeNull();
    expect(await git(repo, ["status", "--porcelain"])).toBe("");
  });
  it("refreshes a tracked course manifest with app-owned changes", async () => {
    const current = await session();
    await writeFile(path.join(current.workspace, "main.py"), "print(1)");
    await save((await app.preview()) as Preview);
    app.observe({
      ...observation(),
      lessons: [
        { id: "44", title: "Another lesson", section: "Pointers", order: 2 },
      ],
    });
    await app.mirror("cpp-masterclass");
    await app.start("cpp-masterclass", "44");
    await app.saveNote("My new note");
    await expect(app.preview()).resolves.toHaveProperty("id");
  });
});
describe("boundary checks", () => {
  it("blocks bare Stripe secrets before checkpoint capture or AI context, while allowing publishable keys", () => {
    for (const prefix of [
      "sk_test_",
      "sk_live_",
      "rk_test_",
      "rk_live_",
      "whsec_",
    ]) {
      expect(
        scan(`const value = '${prefix}${"a".repeat(24)}'`, "billing.ts"),
      ).toContainEqual({
        path: "billing.ts",
        kind:
          prefix === "whsec_" ? "Stripe webhook secret" : "Stripe secret key",
      });
    }
    expect(
      scan(`const value = 'pk_test_${"a".repeat(24)}'`, "billing.ts"),
    ).toEqual([]);
  });
  it("rejects traversal, credential URLs, and unrelated sites", () => {
    expect(() => child(repo, "../outside")).toThrow();
    expect(() => child(repo, "folder/../../outside")).toThrow();
    expect(() =>
      sanitizeUdemyUrl("https://www.udemy.com.evil.example/course/a"),
    ).toThrow();
    expect(() =>
      sanitizeUdemyUrl("https://user:pass@udemy.com/course/a"),
    ).toThrow();
    expect(scan("-----BEGIN PRIVATE KEY-----", "key.txt")).toHaveLength(1);
  });
});
