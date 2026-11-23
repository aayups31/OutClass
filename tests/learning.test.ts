import { afterEach, beforeEach, expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
  realpath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Application } from "../src/server/application";
import { Store } from "../src/server/store";
import { Workspace } from "../src/server/workspace";
import { git, head, initialize } from "../src/server/git";
import type { ResumeAnchor } from "../src/shared";

let directory: string, store: Store, app: Application, workspace: Workspace;
beforeEach(async () => {
  directory = await realpath(
    await mkdtemp(path.join(tmpdir(), "gitlearn-continue-")),
  );
  store = new Store(path.join(directory, "data"));
  app = new Application(store);
  workspace = new Workspace(app);
  await app.setup(path.join(directory, "history"), false);
  for (const id of ["javascript", "python"])
    app.observe({
      eventId: id,
      courseId: id,
      title: id,
      url: `https://www.udemy.com/course/${id}/learn/lecture/1`,
      lessons: [
        { id: "1", title: "Functions", section: "Basics", order: 0 },
        {
          id: "2",
          title: "Building on functions",
          section: "Basics",
          order: 1,
        },
      ],
    });
});
afterEach(async () => {
  workspace.stopAll();
  store.close();
  await rm(directory, { recursive: true, force: true });
});

it("builds one project across two lessons, keeps reviewed snapshots, and resumes its file, note, and actual run after restart", async () => {
  await app.bindProject("javascript", "project");
  const project = store.state().courses[0].project!;
  await app.start("javascript", "1");
  let session = store.state().session!;
  const original = await workspace.save(
    session.id,
    "src/main.js",
    "console.log('First lesson', 42);",
    null,
  );
  await workspace.editorAnchor(session.id, original.path, 12);
  await app.saveNote("Next: split the greeting into a function.");
  const run = await workspace.run(session.id, original.path);
  expect(run.run.exitCode).toBe(0);
  const checkpoint = await app.preview();
  await app.commit(checkpoint.id, checkpoint.message);
  await app.start("javascript", "2");
  session = store.state().session!;
  expect(session.workspace).toBe(project.root);
  expect(session.projectId).toBe(project.id);
  const second = await workspace.save(
    session.id,
    original.path,
    "console.log('Second lesson', 84);",
    original.version,
  );
  await app.saveNote("Next: add input validation.");
  const next = await app.preview();
  await app.commit(next.id, next.message);
  const history = store.state().settings.repoPath;
  expect(
    await git(history, [
      "show",
      `${store.state().checkpoints[1].sha}:${store.state().courses[0].path}/${store.state().courses[0].lessons[0].path}/${original.path}`,
    ]),
  ).toContain("First lesson");
  store.close();
  store = new Store(path.join(directory, "data"));
  app = new Application(store);
  workspace = new Workspace(app);
  const continued = await app.continueCourse("javascript");
  expect(continued.session!.lessonId).toBe("2");
  expect(continued.session!.workspace).toBe(project.root);
  expect(continued.session!.note).toBe("Next: add input validation.");
  const files = await workspace.list(continued.session!.id);
  expect(files.anchor?.file).toBe(original.path);
  expect(files.anchor?.cursor).toBe(12);
  expect(files.lastRun?.id).toBe(run.run.id);
  expect(files.lastRun?.stale).toBe(true);
  expect(
    (await workspace.read(continued.session!.id, original.path)).version,
  ).toBe(second.version);
});

it("migrates a legacy active session without moving code or changing checkpoints and remains idempotent", async () => {
  await app.start("javascript", "1");
  const session = store.state().session!;
  await writeFile(
    path.join(session.workspace, "main.js"),
    "// Existing learner work\n",
  );
  await app.saveNote("Keep this legacy note");
  const before = await head(store.state().settings.repoPath);
  store.remove("learningSchemaVersion");
  store.remove("resume:javascript");
  store.close();
  store = new Store(path.join(directory, "data"));
  app = new Application(store);
  workspace = new Workspace(app);
  const anchor = store.get<ResumeAnchor>("resume:javascript")!;
  expect(anchor.workspace).toBe(session.workspace);
  expect(anchor.note).toBe("Keep this legacy note");
  expect(await head(store.state().settings.repoPath)).toBe(before);
  expect(
    await readFile(path.join(session.workspace, "main.js"), "utf8"),
  ).toContain("Existing learner work");
  store.close();
  store = new Store(path.join(directory, "data"));
  app = new Application(store);
  workspace = new Workspace(app);
  expect(store.get("resume:javascript")).toEqual(anchor);
});

it("isolates course projects, leaves external Git alone, and reports missing folders without recreating them", async () => {
  const external = path.join(directory, "own-project");
  await initialize(external);
  const originalHead = await head(external);
  await app.bindProject("javascript", "project", external);
  await expect(app.bindProject("python", "project", external)).rejects.toThrow(
    "another course",
  );
  await app.start("javascript", "1");
  const first = store.state().session!;
  await workspace.save(
    first.id,
    "main.js",
    "console.log('Own project');",
    null,
  );
  const preview = await app.preview();
  await app.commit(preview.id, preview.message);
  expect(await head(external)).toBe(originalHead);
  await app.bindProject("python", "project");
  await app.start("python", "1");
  expect(store.state().session!.workspace).not.toBe(external);
  await expect(app.continueCourse("javascript")).rejects.toThrow(
    "current session",
  );
  await app.sessionAction("discard");
  await rename(external, external + "-moved");
  expect(
    (await app.status()).continueItems.find(
      (item) => item.courseId === "javascript",
    )?.folderAvailable,
  ).toBe(false);
  await expect(app.continueCourse("javascript")).rejects.toThrow(
    "existing coding folder",
  );
  expect(store.state().session).toBeNull();
  await app.bindProject("javascript", "project", external + "-moved");
  await app.start("javascript", "1");
  expect(
    (await workspace.read(store.state().session!.id, "main.js")).content,
  ).toContain("Own project");
});

it("binds error evidence to the saved entry file and course, marks changed code, and excludes sensitive output", async () => {
  await app.start("javascript", "1");
  const session = store.state().session!;
  const source = await workspace.save(
    session.id,
    "failure.js",
    "throw new Error('Actual failure');",
    null,
  );
  const result = await workspace.run(session.id, source.path);
  expect(result.exitCode).not.toBe(0);
  expect(result.run.output).toContain("Actual failure");
  expect(result.run.fileVersion).toBe(source.version);
  expect(result.run.stale).toBe(false);
  await workspace.save(
    session.id,
    source.path,
    "console.log('Fixed locally');",
    source.version,
  );
  expect((await workspace.runContext(session.id, result.run.id)).stale).toBe(
    true,
  );
  await workspace.save(
    session.id,
    "sensitive.js",
    "console.log('sk-' + 'x'.repeat(40));",
    null,
  );
  const sensitive = await workspace.run(session.id, "sensitive.js");
  expect(sensitive.run.output).toContain("Sensitive content excluded");
  expect(JSON.stringify(store.get("runs:javascript"))).not.toContain(
    "sk-" + "x".repeat(40),
  );
  await app.sessionAction("discard");
  await app.start("python", "1");
  await expect(
    workspace.runContext(store.state().session!.id, result.run.id),
  ).rejects.toThrow("does not belong");
});

it("reports a missing resume file and clamps its cursor instead of losing the course workspace", async () => {
  await app.start("javascript", "1");
  const session = store.state().session!;
  await workspace.save(session.id, "main.js", "// short", null);
  expect(
    (await workspace.editorAnchor(session.id, "main.js", 500)).cursor,
  ).toBe(8);
  await rm(path.join(session.workspace, "main.js"));
  await app.sessionAction("pause");
  const item = (await app.status()).continueItems[0];
  expect(item.folderAvailable).toBe(true);
  expect(item.fileAvailable).toBe(false);
  await app.continueCourse("javascript");
  expect(store.state().session!.status).toBe("active");
});
it("reattaches a moved project during an active session and preserves the note, cursor, project identity, and history", async () => {
  await app.bindProject("javascript", "project");
  await app.start("javascript", "1");
  const session = store.state().session!;
  await workspace.save(
    session.id,
    "main.js",
    "console.log('Continue here');",
    null,
  );
  await workspace.editorAnchor(session.id, "main.js", 10);
  await app.saveNote("Next: test a different greeting.");
  const before = await head(store.state().settings.repoPath);
  await rename(session.workspace, session.workspace + "-moved");
  const continued = await app.continueCourse(
    "javascript",
    session.workspace + "-moved",
  );
  expect(continued.session!.id).not.toBe(session.id);
  expect(continued.session!.projectId).toBe(session.projectId);
  expect(continued.session!.note).toBe("Next: test a different greeting.");
  const files = await workspace.list(continued.session!.id);
  expect(files.anchor?.file).toBe("main.js");
  expect(files.anchor?.cursor).toBe(10);
  expect(continued.courses[0].project?.root).toBe(continued.session!.workspace);
  expect(await head(continued.settings.repoPath)).toBe(before);
});
