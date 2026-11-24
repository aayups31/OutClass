import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Store } from "../src/server/store";
import { Application } from "../src/server/application";
import { Workspace } from "../src/server/workspace";
import { Practice } from "../src/server/practice";
import { CourseLibrary } from "../src/server/library";
import { LearnTools } from "../src/server/learn-tools";
import { LearnProgress } from "../src/server/learn-progress";
let folder: string,
  store: Store,
  app: Application,
  workspace: Workspace,
  practice: Practice;
beforeEach(async () => {
  folder = await mkdtemp(path.join(tmpdir(), "gitlearn-practice-"));
  store = new Store(path.join(folder, "data"));
  app = new Application(store);
  workspace = new Workspace(app);
  practice = new Practice(app, workspace);
  await app.setup(path.join(folder, "history"), false);
  for (const id of ["js", "python"])
    app.observe({
      eventId: id,
      courseId: id,
      title: id === "js" ? "JavaScript functions" : "Python functions",
      url: `https://www.udemy.com/course/${id}/learn/lecture/1`,
      lessons: [{ id: "1", title: "Functions", section: "Basics", order: 0 }],
    });
});
afterEach(async () => {
  await workspace.stopAll();
  store.close();
  await rm(folder, { recursive: true, force: true });
});
it("searches saved lesson evidence and verifies a reviewed lesson practical using real checks", async () => {
  const library = new CourseLibrary(app);
  const tools = new LearnTools(app, library, practice);
  library.document("js", "Scoring transcript", "Double each input to compute a practice score. Zero stays zero.", "transcript", "1");
  library.document("python", "Python scoring notes", "Double each input with Python to compute the score.", "material", "1");
  await app.start("js", "1");
  await app.saveNote("Remember to start from a double score example.");
  const session = store.state().session!;
  await workspace.save(session.id, "sample.js", "// Example: double score\nconst score = 4;", null);
  expect(await tools.search("double score")).toEqual(expect.arrayContaining([
    expect.objectContaining({ courseId: "js", kind: "Code" }),
    expect.objectContaining({ courseId: "js", kind: "Note" }),
    expect.objectContaining({ courseId: "python", kind: "Source" }),
  ]));
  const state = store.state();
  state.settings.assistantEnabled = true;
  store.save(state);
  const answer = {
    title: "Score each round", skill: "Integer transformation", brief: "Double the input to produce the round score.",
    requirements: ["Return an integer.", "Keep a zero input at zero."],
    hints: ["Work through the example by hand.", "Check the effect of adding the input to itself."],
    minutes: 12,
    cases: [0, 2, -3].map((input) => ({ label: `Round ${input}`, inputJson: String(input), outputJson: String(input * 2) })),
  };
  vi.spyOn(app.ai, "ready").mockReturnValue(true);
  const structured = vi.spyOn(app.ai, "structured")
    .mockResolvedValueOnce({ answer: "Two courses saved examples for doubling. [1] [2]", citations: [1, 2] })
    .mockResolvedValueOnce({ ...answer, cases: answer.cases.map((item) => ({ ...item, inputJson: "null" })) })
    .mockResolvedValueOnce(answer);
  const sourced = await tools.ask(["js", "python"], "double score");
  expect(sourced.sources.map((item) => item.courseId)).toEqual(["js", "python"]);
  expect(structured).toHaveBeenCalledTimes(1);
  await expect(tools.draft("js", "1", "javascript")).rejects.toThrow("invalid or repeated");
  const draft = await tools.draft("js", "1", "javascript");
  expect(draft.checks).toHaveLength(3);
  expect(practice.tasks()).toHaveLength(0);
  await expect(practice.start("python", draft.id)).rejects.toThrow("drafted for");
  const task = await practice.start("js", draft.id);
  expect(tools.next().practical?.id).toBe(draft.id);
  expect((await practice.hint(task.id)).level).toBe(1);
  const file = await workspace.read(session.id, task.path);
  await workspace.save(session.id, task.path, "export function solve(value) { return value * 2; }\n", file.version);
  expect((await practice.check(task.id, session.id)).status).toBe("completed");
  expect(practice.dashboard().skills).toEqual(expect.arrayContaining([expect.objectContaining({
    language: "javascript", skill: "Integer transformation",
  })]));
  const progress = new LearnProgress(app, practice);
  app.ai.session = { email: "learner@example.com", access_token: "test-access", refresh_token: "test-refresh", expires_at: 9999999999 };
  const sync = vi.spyOn(app.ai, "learnProgress").mockResolvedValue({ devices: [] });
  await progress.sync();
  expect(sync).not.toHaveBeenCalled();
  progress.configure(true);
  await progress.sync();
  expect(sync).toHaveBeenCalledWith(expect.objectContaining({ snapshot: progress.status().progress }));
  expect(JSON.stringify(sync.mock.calls)).not.toContain("Remember");
  expect(JSON.stringify(sync.mock.calls)).not.toContain(task.path);
  app.ai.session = { ...app.ai.session, email: "different@example.com" };
  expect(progress.status().enabled).toBe(false);
  expect(progress.status().syncedAt).toBeNull();
});
it("suggests practice before course completion, supports deferral, and never invents evidence", async () => {
  expect(practice.dashboard().opportunities).toEqual([]);
  await app.start("js", "1");
  const id = store.state().session!.id;
  await workspace.save(
    id,
    "main.js",
    "console.log('learned a function')",
    null,
  );
  await workspace.run(id, "main.js");
  const suggestion = practice.dashboard().opportunities[0];
  expect(suggestion.courseId).toBe("js");
  expect(suggestion.evidence).toBeTruthy();
  practice.defer(suggestion.key, 1);
  expect(practice.dashboard().opportunities).toEqual([]);
});
it("fails an unfinished task, records hint use, verifies saved behavior, and survives restart", async () => {
  const task = await practice.start("js", "javascript-validation");
  const id = store.state().session!.id;
  expect((await practice.check(task.id, id)).attempts[0].passed).toBe(false);
  const hint = await practice.hint(task.id);
  expect(hint.level).toBe(1);
  expect(hint.hint).not.toContain("return");
  const file = await workspace.read(id, task.path);
  await workspace.save(
    id,
    task.path,
    "export function discountedPrice(price, discount) { if (price<0 || discount<0 || discount>100) throw Error('invalid'); return Math.round(price*(1-discount/100)*100)/100; }",
    file.version,
  );
  const complete = await practice.check(task.id, id);
  expect(complete.status).toBe("completed");
  expect(complete.attempts[0].checks.every((c) => c.passed)).toBe(true);
  expect(practice.dashboard().skills[0].assistance).toContain("help");
  store.close();
  store = new Store(path.join(folder, "data"));
  app = new Application(store);
  workspace = new Workspace(app);
  practice = new Practice(app, workspace);
  expect(practice.task(task.id).attempts).toHaveLength(2);
  expect(practice.dashboard().reviews[0].evidenceId).toBe(
    complete.attempts[0].id,
  );
  expect(complete.attempts[0].source).toContain(
    "export function discountedPrice",
  );
  practice.update(
    task.id,
    "reflection",
    "Validation happens before arithmetic.",
  );
  expect(practice.search("validation")[0].reflection).toContain(
    "before arithmetic",
  );
  expect(practice.search("validation")[0].attempt!.fileVersion).toBe(
    complete.attempts[0].fileVersion,
  );
  expect(practice.dashboard("js").liveOpportunities).toHaveLength(1);
  practice.defer("js:live", 1);
  expect(practice.dashboard("js").liveOpportunities).toEqual([]);
  const review = await practice.start("js", "javascript-validation", task.id);
  expect(review.path).not.toBe(task.path);
  expect(review.hints).toBe(0);
  const reviewFile = await workspace.read(id, review.path);
  await workspace.save(
    id,
    review.path,
    complete.attempts[0].source,
    reviewFile.version,
  );
  await practice.check(review.id, id);
  expect(practice.dashboard("js").reviews).toHaveLength(1);
  expect(practice.dashboard("js").reviews[0].taskId).toBe(task.id);
  await expect(
    practice.start("js", "javascript-validation", review.id),
  ).rejects.toThrow("completed task");
});
it("verifies Python behavior and protects another course from task evidence", async () => {
  const task = await practice.start("python", "python-collections");
  const id = store.state().session!.id;
  const file = await workspace.read(id, task.path);
  await workspace.save(
    id,
    task.path,
    "def completed_minutes(sessions):\n    return sum(s['minutes'] for s in sessions if s.get('completed') is True and isinstance(s.get('minutes'), (int,float)) and s['minutes'] > 0)\n",
    file.version,
  );
  expect((await practice.check(task.id, id)).attempts[0].passed).toBe(true);
  await app.sessionAction("discard");
  await app.start("js", "1");
  await expect(
    practice.check(task.id, store.state().session!.id),
  ).rejects.toThrow("original course folder");
  expect(practice.dashboard("js").tasks).toHaveLength(0);
});
it("allows only one active task per course and keeps a paused attempt", async () => {
  const first = await practice.start("js", "javascript-validation");
  await expect(practice.start("js", "javascript-collections")).rejects.toThrow(
    "pause",
  );
  practice.update(first.id, "pause");
  const second = await practice.start("js", "javascript-collections");
  expect(practice.task(first.id).status).toBe("paused");
  expect(() => practice.update(first.id, "resume")).toThrow("Pause");
  practice.update(second.id, "pause");
  expect(practice.update(first.id, "resume").status).toBe("active");
});
