import { it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Store } from "../src/server/store";
import { Application } from "../src/server/application";
import { Expansion } from "../src/server/expansion";
import {
  AcademyStudio,
  importAcademy,
  auditAcademy,
} from "../src/server/academy-studio";
import { arrangeLessons, lessonEvidence } from "../src/academy-design";
import { LearnDelivery } from "../src/server/learn-delivery";
import type { AcademyDraft } from "../src/expansion-contract";
let dir: string,
  store: Store,
  app: Application,
  expansion: Expansion,
  studio: AcademyStudio;
const course = (): AcademyDraft => ({
  title: "Activity reports",
  audience: "Python learners who know loops",
  outcome: "Build a report for a club organizer",
  rightsConfirmed: true,
  lessons: [0, 1].map((i) => ({
    title: i ? "Handle empty data" : "Group records",
    objective: "Produce a total for each person",
    practice: "Group Ada’s two records and test the empty input",
    content: "A dictionary keyed by person accumulates minutes from records.",
    learn: {
      minutes: 20,
      prerequisiteLessons: i ? [0] : [],
      acceptanceCriteria: [
        "Ada’s repeated records produce one combined total",
        "Empty input returns an empty result",
      ],
      hints: ["What identifies a group?"],
      reflection: "Which examples did you check, and what did they show?",
      transferChallenge: "Group by activity instead of person",
      starterFiles: [
        { path: "main.py", content: "# Write your own attempt\n" },
      ],
    },
  })),
  learningProject: {
    title: "Club activity report",
    problem: "A club organizer needs weekly activity totals",
    deliverable: "A report that groups records and handles empty weeks",
    milestones: [
      {
        lessonIndex: 0,
        title: "First report",
        brief: "Build the grouping increment",
        acceptanceCriteria: ["Repeated people produce one total"],
      },
      {
        lessonIndex: 1,
        title: "Empty weeks",
        brief: "Handle a week with no records",
        acceptanceCriteria: ["Empty input produces a useful empty report"],
      },
    ],
  },
});
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "outclass-academy-studio-"));
  store = new Store(path.join(dir, "data"));
  app = new Application(store);
  expansion = new Expansion(app);
  studio = new AcademyStudio(app, expansion);
});
afterEach(async () => {
  store.close();
  await rm(dir, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
});
it("imports complete Markdown and preserves code fences without granting rights", () => {
  const result = importAcademy({
    name: "course.md",
    text: "# Activity reports\nAudience: Beginners\nOutcome: A working report\n## Lesson: Group records\nObjective: Accumulate totals\nPractice: Handle repeated people\nKeep all source material.\n```md\n## This is code, not another lesson\n```\n## Empty input\nObjective: Return an empty result\nPractice: Test an empty week\nKeep this material too.",
  });
  expect(result.course.lessons).toHaveLength(2);
  expect(result.course.lessons[0].content).toContain("## This is code");
  expect(result.course.rightsConfirmed).toBe(false);
  expect(result.course.audience).toBe("Beginners");
});
it("round-trips JSON project/starter content and rejects invalid or oversized imports without truncation", () => {
  const result = importAcademy({
    name: "course.json",
    text: JSON.stringify({
      format: "outclass-academy",
      version: 1,
      course: course(),
    }),
  });
  expect(result.course.learningProject).toEqual(course().learningProject);
  expect(result.course.lessons[0].learn).toEqual(course().lessons[0].learn);
  expect(() =>
    importAcademy({ name: "bad.json", text: '{"title":"bad"}' }),
  ).toThrow(/valid/);
  expect(() =>
    importAcademy({
      name: "bad.md",
      text: "# Example\n## Too long\n" + "a".repeat(40001),
    }),
  ).toThrow(/Nothing was truncated/);
  expect(() =>
    importAcademy({
      name: "secret.md",
      text: "# Keys\n## API\nOPENAI_API_KEY=sk-1234567890abcdefghijklmnopqrstuvwxyz",
    }),
  ).toThrow();
});
it("remaps prerequisites and milestone references when lessons move or are removed", () => {
  const moved = arrangeLessons(course(), [1, 0]);
  expect(moved.lessons[0].learn!.prerequisiteLessons).toEqual([1]);
  expect(moved.learningProject!.milestones[0].title).toBe("Empty weeks");
  const removed = arrangeLessons(course(), [1]);
  expect(removed.lessons[0].learn!.prerequisiteLessons).toEqual([]);
  expect(removed.learningProject!.milestones).toHaveLength(1);
  expect(() => arrangeLessons(course(), [0, 0])).toThrow();
  expect(course().lessons[1].learn!.prerequisiteLessons).toEqual([0]);
});
it("reports actionable pedagogy gaps separately from blockers and never produces a mastery score", () => {
  const c = course();
  c.lessons[0].objective = "Understand dictionaries";
  c.lessons[0].learn = undefined;
  const saved = expansion.saveCourse({ ...c, expectedRevision: 0 }),
    audit = studio.audit(saved.id);
  expect(audit.findings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "0:observable", level: "review" }),
      expect.objectContaining({ id: "0:assignment", lessonIndex: 0 }),
    ]),
  );
  expect(audit.coverage.assignments).toBe(1);
  expect(audit).not.toHaveProperty("score");
  const moved = arrangeLessons(c, [1, 0]);
  expect(
    auditAcademy({
      ...moved,
      id: saved.id,
      revision: 1,
      updatedAt: saved.updatedAt,
    }).findings.some((f) => f.id === "0:order"),
  ).toBe(true);
});
it("requires exact review, acknowledges findings and invalidates approval after a source edit", () => {
  const c = course();
  c.lessons[0].learn!.hints = [];
  const saved = expansion.saveCourse({ ...c, expectedRevision: 0 }),
    audit = studio.audit(saved.id);
  expect(() =>
    studio.release(saved.id, {
      expectedRevision: 1,
      reviewHash: audit.hash,
      approve: true,
    }),
  ).toThrow(/review/);
  expect(() =>
    studio.review(saved.id, {
      expectedRevision: 1,
      hash: audit.hash,
      acknowledged: [],
      approve: true,
    }),
  ).toThrow(/every/);
  const reviewed = studio.review(saved.id, {
    expectedRevision: 1,
    hash: audit.hash,
    acknowledged: audit.findings
      .filter((f) => f.level === "review")
      .map((f) => f.id),
    approve: true,
  });
  const released = studio.release(saved.id, {
    expectedRevision: 1,
    reviewHash: reviewed.hash,
    approve: true,
  });
  expect(released.learningProject).toEqual(c.learningProject);
  expect(
    studio.release(saved.id, {
      expectedRevision: 1,
      reviewHash: reviewed.hash,
      approve: true,
    }).id,
  ).toBe(released.id);
  expansion.saveCourse({
    ...c,
    id: saved.id,
    expectedRevision: 1,
    title: "Edited",
  });
  expect(studio.audit(saved.id).review).toBeUndefined();
  expect(() =>
    studio.release(saved.id, {
      expectedRevision: 2,
      reviewHash: reviewed.hash,
      approve: true,
    }),
  ).toThrow(/review/);
});
it("rejects invalid project links and supports a practical curriculum beyond thirty lessons", () => {
  const c = course();
  c.learningProject!.milestones[1].lessonIndex = 199;
  const saved = expansion.saveCourse({ ...c, expectedRevision: 0 });
  expect(
    studio
      .audit(saved.id)
      .findings.some((f) => f.level === "blocker" && f.id.includes("link")),
  ).toBe(true);
  const many = {
    ...course(),
    learningProject: undefined,
    lessons: Array.from({ length: 75 }, (_, i) => ({
      ...course().lessons[0],
      title: `Lesson ${i + 1}`,
    })),
  };
  expect(
    expansion.saveCourse({ ...many, expectedRevision: 0 }).lessons,
  ).toHaveLength(75);
});
it("retrieves bounded literal source excerpts relevant to a task without changing stored text", () => {
  const text =
    "General material.\n\n" +
    "Unrelated explanation. ".repeat(1000) +
    "\n\nThe empty input requirement uses an empty dictionary.";
  const selected = lessonEvidence(text, "empty input", 2500);
  expect(selected.complete).toBe(false);
  expect(selected.text.length).toBeLessThanOrEqual(2500);
  expect(selected.text).toContain("empty dictionary");
});
it("delivers a frozen project increment into an isolated instructor preview with preserved files", async () => {
  await app.setup(path.join(dir, "history"), false);
  const saved = expansion.saveCourse({ ...course(), expectedRevision: 0 }),
    audit = studio.audit(saved.id);
  studio.review(saved.id, {
    expectedRevision: 1,
    hash: audit.hash,
    acknowledged: [],
    approve: true,
  });
  const release = studio.release(saved.id, {
    expectedRevision: 1,
    reviewHash: audit.hash,
    approve: true,
  });
  const result = await expansion.launch(release.id, 0, true),
    session = store.state().session!;
  expect(
    store.state().courses.find((c) => c.id === result.courseId)?.workspaceMode,
  ).toBe("project");
  const delivery = new LearnDelivery(app),
    value = delivery.snapshot(result.courseId, "lesson-0")!;
  expect(value.preview).toBe(true);
  expect(value.project?.milestone?.title).toBe("First report");
  expect(
    await readFile(
      path.join(
        session.workspace,
        "assignments/lesson-0/PROJECT_CONNECTION.md",
      ),
      "utf8",
    ),
  ).toContain("Club activity report");
  await writeFile(
    path.join(session.workspace, "assignments/lesson-0/main.py"),
    "# My original attempt",
  );
  await delivery.seed(result.courseId, "lesson-0");
  expect(
    await readFile(
      path.join(session.workspace, "assignments/lesson-0/main.py"),
      "utf8",
    ),
  ).toBe("# My original attempt");
  expect(
    delivery.teacherContext(result.courseId, "lesson-0")?.project?.milestone
      ?.title,
  ).toBe("First report");
});
