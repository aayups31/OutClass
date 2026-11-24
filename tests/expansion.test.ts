import { beforeEach, afterEach, it, expect } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Store } from "../src/server/store";
import { Application } from "../src/server/application";
import { Expansion, validateCourse } from "../src/server/expansion";
let dir: string, store: Store, app: Application, expansion: Expansion;
const draft = {
  title: "Python activities",
  audience: "Python beginners who can use a loop",
  outcome: "Build an activity report",
  rightsConfirmed: true,
  lessons: [
    {
      title: "Accumulate totals",
      objective: "Group minutes by student",
      practice: "Handle repeat students and empty input",
      content: "Use a dictionary to retain each student's running total.",
    },
  ],
};
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "outclass-expansion-"));
  store = new Store(path.join(dir, "data"));
  app = new Application(store);
  expansion = new Expansion(app);
});
afterEach(async () => {
  store.close();
  await rm(dir, { recursive: true, force: true });
});
function release() {
  const c = expansion.saveCourse({ ...draft, expectedRevision: 0 });
  return expansion.release(c.id, {
    expectedRevision: c.revision,
    approve: true,
  });
}
it("keeps author-created chapter names in drafts and publishes grouping through lessons", () => {
  const saved = expansion.saveCourse({
    ...draft,
    chapters: ["First report", "Optional follow-up"],
    lessons: [{ ...draft.lessons[0], chapter: "First report" }],
    expectedRevision: 0,
  });
  expect(expansion.state().courses[0].chapters).toEqual(saved.chapters);
  const published = expansion.release(saved.id, { expectedRevision: saved.revision, approve: true });
  expect(published).not.toHaveProperty("chapters");
  expect(published.lessons[0].chapter).toBe("First report");
});
it("imports a scoped hosted assignment into the real Learn workspace and preserves its lesson sources", async () => {
  await app.setup(path.join(dir, "history"), false);
  const id = "ef6669f8-4248-454f-8ba3-d8e22bc4aa88";
  let redeemed = 0;
  app.ai.platform = async () => {
    redeemed++;
    return {
      contractVersion: 1,
      id,
      title: draft.title,
      revision: 1,
      lessonIndex: 0,
      course: draft,
      projectTemplate: "python_activity_api_v1",
      scopes: ["read_assignment"],
    };
  };
  const result = await expansion.importHosted("a".repeat(64));
  expect(result.courseId).toBe(`academy:${id}`);
  expect(
    await readFile(
      path.join(store.state().session!.workspace, "main.py"),
      "utf8",
    ),
  ).toContain("NotImplementedError");
  expect(
    store.db
      .prepare(
        "SELECT content FROM rag_documents WHERE course_id=? AND kind='academy'",
      )
      .get(result.courseId),
  ).toMatchObject({ content: expect.stringContaining("running total") });
  await expect(expansion.importHosted("b".repeat(64))).rejects.toThrow(
    /current Learn session/,
  );
  expect(redeemed).toBe(1);
});
it("validates structure honestly and blocks missing rights, content and stale approval", () => {
  expect(validateCourse(draft).technicalVerification).toBe("not_run");
  const c = expansion.saveCourse({
    ...draft,
    rightsConfirmed: false,
    expectedRevision: 0,
  });
  expect(() =>
    expansion.release(c.id, { expectedRevision: 1, approve: true }),
  ).toThrow(/rights/);
  const saved = expansion.saveCourse({
    ...draft,
    id: c.id,
    expectedRevision: 1,
  });
  expect(() =>
    expansion.release(c.id, { expectedRevision: 1, approve: true }),
  ).toThrow(/changed/);
  expect(() =>
    expansion.release(c.id, {
      expectedRevision: saved.revision,
      approve: false,
    }),
  ).toThrow();
});
it("freezes released versions, rejects lost updates and survives a Store restart", () => {
  const r = release();
  expect(
    expansion.release(r.courseId, { expectedRevision: 1, approve: true }).id,
  ).toBe(r.id);
  expansion.saveCourse({
    ...draft,
    title: "Edited draft",
    id: r.courseId,
    expectedRevision: 1,
  });
  expect(() =>
    expansion.saveCourse({ ...draft, id: r.courseId, expectedRevision: 1 }),
  ).toThrow(/changed/);
  store.close();
  store = new Store(path.join(dir, "data"));
  app = new Application(store);
  expansion = new Expansion(app);
  expect(expansion.state().releases[0].title).toBe(draft.title);
  expect(expansion.state().courses[0].title).toBe("Edited draft");
});
it("enrolls idempotently and launches a real version-pinned Learn session without executing code", async () => {
  const r = release();
  await app.setup(path.join(dir, "history"), false);
  await expect(expansion.launch(r.id, 0)).rejects.toThrow(/Enroll/);
  expansion.enroll(r.id);
  expansion.enroll(r.id);
  expect(expansion.state().enrollments).toHaveLength(1);
  const opened = await expansion.launch(r.id, 0);
  expect(app.store.state().session?.courseId).toBe(opened.courseId);
  expect(app.store.state().session?.note).toContain(draft.lessons[0].practice);
  const course = app.store.state().courses[0];
  const manifest = JSON.parse(
    await readFile(
      path.join(dir, "history", course.path, "course.json"),
      "utf8",
    ),
  );
  expect(manifest.platform).toBe("academy");
  expect(manifest.discovery).toBe("versioned");
  expect((await expansion.launch(r.id, 0)).sessionId).toBe(opened.sessionId);
  expect(app.store.get("lastRun")).toBeUndefined();
});
it("rejects a different lesson while Learn has an active session", async () => {
  const r = release();
  expansion.enroll(r.id);
  await app.setup(path.join(dir, "history"), false);
  await expansion.launch(r.id, 0);
  const c = expansion.saveCourse({
    ...draft,
    title: "Another",
    expectedRevision: 0,
  });
  const r2 = expansion.release(c.id, { expectedRevision: 1, approve: true });
  expansion.enroll(r2.id);
  await expect(expansion.launch(r2.id, 0)).rejects.toThrow(/current Learn/);
  expect(app.store.state().courses).toHaveLength(1);
});
it("campaigns require approved copy and keep a snapshot when the creative is revised", () => {
  const r = release();
  const payload = {
    title: "Course intro",
    releaseId: r.id,
    lessonIndex: 0,
    brief: "Share one real objective",
    copy: "Practice grouping activity totals",
    brandColor: "#386bfa",
    rightsConfirmed: true,
  };
  const c = expansion.saveCreative({ ...payload, expectedRevision: 0 });
  const campaign = {
    title: "Python launch",
    creativeId: c.id,
    destination: "https://example.com/course?utm_source=old",
    source: "linkedin",
    medium: "organic",
    goal: "Learn whether beginners understand the offer",
    budgetMinor: 1200,
    currency: "CAD",
  };
  expect(() =>
    expansion.saveCampaign({ ...campaign, expectedRevision: 0 }),
  ).toThrow(/Approve/);
  const approved = expansion.approveCreative(c.id, {
    expectedRevision: 1,
    approve: true,
  });
  const g = expansion.saveCampaign({ ...campaign, expectedRevision: 0 });
  expect(g.creativeHash).toBe(approved.approval?.hash);
  expect(new URL(g.trackedUrl).searchParams.get("utm_source")).toBe("linkedin");
  expect(g.status).toBe("draft");
  expansion.saveCreative({
    ...payload,
    id: c.id,
    expectedRevision: 1,
    copy: "Revised copy",
  });
  expect(expansion.state().creatives[0].approval).toBeUndefined();
  expect(expansion.state().campaigns[0].creativeSnapshot.copy).toBe(
    payload.copy,
  );
  expect(() =>
    expansion.saveCampaign({ ...campaign, expectedRevision: 0 }),
  ).toThrow(/Approve/);
});
it("rejects unsupported media, unexpected fields and dangerous destinations", () => {
  const r = release();
  expect(() =>
    expansion.saveCourse({
      ...draft,
      expectedRevision: 0,
      hiddenCommand: "run",
    }),
  ).toThrow();
  expect(() =>
    expansion.saveCreative({
      title: "bad",
      releaseId: r.id,
      lessonIndex: 29,
      brief: "",
      copy: "",
      brandColor: "#386bfa",
      rightsConfirmed: false,
      expectedRevision: 0,
    }),
  ).toThrow(/lesson/);
  expect(() =>
    expansion.saveCampaign({
      title: "bad",
      creativeId: r.id,
      destination: "javascript:alert(1)",
      source: "a",
      medium: "b",
      goal: "",
      budgetMinor: 0,
      currency: "CAD",
      expectedRevision: 0,
    }),
  ).toThrow(/HTTPS/);
});
