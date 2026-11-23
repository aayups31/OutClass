import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { Store } from "../src/server/store";
import { Application } from "../src/server/application";
import { Expansion } from "../src/server/expansion";
import { CourseArchive } from "../src/server/course-archive";
import { CourseResearch } from "../src/server/course-research";
import { CourseSubmissions } from "../src/server/course-submissions";
import { CourseSandbox } from "../src/server/course-sandbox";
import { Workspace } from "../src/server/workspace";
import { academyExample } from "../src/academy-example";
import { courseDraft } from "../src/expansion-contract";
import { lessonBlocks, blocksText } from "../src/lesson-blocks";
import { importAcademy, AcademyStudio } from "../src/server/academy-studio";
import { COURSE_CHAR_LIMIT, COURSE_SOURCE_LIMIT } from "../src/course-limits";
import { writtenLesson } from "./helpers/course-workshop";
let directory: string, store: Store, app: Application;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "outclass-course-production-"));
  store = new Store(path.join(directory, "data"));
  app = new Application(store);
});
afterEach(async () => {
  vi.restoreAllMocks();
  store.close();
  await rm(directory, { recursive: true, force: true });
});
it("round-trips an exported course at the supported content boundary and stores immutable lessons separately", () => {
  const course = courseDraft.parse({
    title: "Boundary fixture",
    audience: "Synthetic transport test",
    outcome: "Preserve every lesson",
    rightsConfirmed: true,
    lessons: Array.from({ length: 200 }, (_, index) => ({
      title: `Lesson ${index}`,
      objective: "Transport exact content",
      practice: "Read this fixture",
      content: "λ",
    })),
  });
  let remaining = COURSE_CHAR_LIMIT - JSON.stringify(course).length - 1000;
  for (const lesson of course.lessons) {
    const count = Math.min(COURSE_SOURCE_LIMIT - 1, remaining);
    lesson.content += "λ".repeat(count);
    remaining -= count;
  }
  const saved = new Expansion(app).saveCourse({
      ...course,
      expectedRevision: 0,
    }),
    file = JSON.stringify(
      { format: "outclass-academy", version: 1, course },
      null,
      2,
    );
  expect(file.length).toBeGreaterThan(COURSE_CHAR_LIMIT);
  const restored = importAcademy({ name: "export.json", text: file });
  expect(restored.course.lessons).toEqual(course.lessons);
  expect(JSON.stringify(store.get("expansion:v1")).length).toBeLessThan(350000);
  expect(new Expansion(app).state().courses[0].lessons).toEqual(saved.lessons);
  const raw = store.get<any>("expansion:v1");
  store.remove(`academy:content:${raw.courses[0].lessonHashes[0]}`);
  expect(() => new Expansion(app).state()).toThrow(/missing or corrupt/);
});
it("restores draft history and media manifests without exposing private banks in the public backup", async () => {
  const expansion = new Expansion(app),
    saved = expansion.saveCourse({ ...academyExample(), expectedRevision: 0 });
  store.put(`academy:teacher:${saved.id}:1`, [
    {
      itemId: "private-item",
      correctChoice: 0,
      rationale: "Original key",
      feedback: ["yes", "no"],
    },
  ]);
  const { revision: _revision, updatedAt: _updated, ...draft } = saved;
  const changed = expansion.saveCourse({
    ...draft,
    expectedRevision: 1,
    title: "Changed course",
  });
  expect(expansion.history(saved.id)[0].title).toBe(saved.title);
  const archive = await new CourseArchive(app).export(changed.id, false, true);
  expect(archive).not.toHaveProperty("privateHistory");
  const target = new Store(path.join(directory, "fresh"));
  try {
    const fresh = new Application(target),
      restored = await new CourseArchive(fresh).restore(archive, true),
      courses = new Expansion(fresh);
    expect(courses.history(restored.id)[0].title).toBe(saved.title);
    expect(courses.restoreRevision(restored.id, 1, 1).title).toBe(saved.title);
    const corrupt = structuredClone(archive),
      hash = Object.keys(corrupt.lessonContent)[0];
    corrupt.lessonContent[hash].content = "tampered";
    await expect(
      new CourseArchive(fresh).restore(corrupt, true),
    ).rejects.toThrow(/historical lesson/);
  } finally {
    target.close();
  }
});
it("requires semantic structure and text alternatives for rich teaching blocks", () => {
  const blocks = lessonBlocks.parse([
    {
      kind: "diagram",
      caption: "Records become a report",
      description: "Input records are validated before aggregation.",
      nodes: [
        { label: "Validate", detail: "Reject negative minutes" },
        { label: "Accumulate", detail: "Retain the running total" },
      ],
    },
    {
      kind: "table",
      caption: "A repeated name",
      headers: ["Name", "Minutes"],
      rows: [["Ari", "12"]],
    },
    {
      kind: "equation",
      notation: "total = previous + minutes",
      explanation: "Accumulate instead of replacing the earlier total.",
    },
  ]);
  expect(blocksText(blocks)).toContain("Reject negative minutes");
  expect(() =>
    lessonBlocks.parse([
      {
        kind: "table",
        caption: "Incomplete table",
        headers: ["Name", "Minutes"],
        rows: [["Ari"]],
      },
    ]),
  ).toThrow(/column headings/);
  expect(() =>
    lessonBlocks.parse([
      {
        kind: "diagram",
        caption: "No description",
        nodes: [
          { label: "A", detail: "one" },
          { label: "B", detail: "two" },
        ],
      },
    ]),
  ).toThrow();
});
it("backs up reviewed research, restores it inactive and invalidates a release review when permission is revoked", async () => {
  const research = new CourseResearch(app),
    reference = {
      id: randomUUID(),
      title: "Original accumulator reading",
      authors: "Fixture educator",
      publisher: "Original fixture",
      url: "https://example.org/accumulators",
      license: "Original fixture permission",
      licenseUrl: "",
      permissionNote:
        "Original material approved for this course and its configured AI.",
      excerpt: "Retain earlier totals when accumulating repeated records.",
      approved: true,
    };
  const reading = await research.ingest({
    reference,
    topics: ["python"],
    level: "introductory",
    format: "text",
    body: "Dictionary accumulators retain earlier totals when a repeated name occurs.",
    expiresOn: "",
  });
  const backup = research.backup(),
    target = new Store(path.join(directory, "research-fresh"));
  try {
    const freshResearch = new CourseResearch(new Application(target));
    freshResearch.restore(backup);
    expect(freshResearch.search("dictionary accumulator")).toEqual([]);
    freshResearch.approve(reading.id);
    expect(freshResearch.search("dictionary accumulator")).toHaveLength(1);
    const corrupt = structuredClone(backup);
    corrupt.documents[0].sections[0].text = "Changed evidence";
    expect(() => freshResearch.restore(corrupt)).toThrow(/integrity/);
  } finally {
    target.close();
  }
  const course = academyExample();
  course.lessons[0].researchEvidence = [
    { documentId: reading.id, hash: reading.hash, expiresOn: "" },
  ];
  const expansion = new Expansion(app),
    saved = expansion.saveCourse({ ...course, expectedRevision: 0 }),
    studio = new AcademyStudio(app, expansion),
    before = studio.audit(saved.id);
  research.revoke(reading.id);
  const after = studio.audit(saved.id);
  expect(after.hash).not.toBe(before.hash);
  expect(
    after.findings.some((finding) => finding.id.startsWith("research:")),
  ).toBe(true);
});
it("binds project evidence to exact learner versions and grades against immutable released tests", async () => {
  await app.setup(path.join(directory, "history"), false);
  const fixture = writtenLesson(0),
    course = academyExample();
  course.rightsConfirmed = true;
  course.lessons[0].learn = fixture.assignment;
  course.lessons[0].rubric = fixture.rubric;
  course.lessons[0].codeCheck = {
    language: "python",
    runtime: "Python 3.12",
    sourcePath: fixture.solutionPath,
  };
  const expansion = new Expansion(app),
    saved = expansion.saveCourse({ ...course, expectedRevision: 0 }),
    release = expansion.release(saved.id, {
      expectedRevision: 1,
      approve: true,
    });
  expansion.enroll(release.id);
  const { courseId } = await expansion.launch(release.id, 0),
    session = store.state().session!,
    workspace = new Workspace(app),
    original = await workspace.read(
      session.id,
      `assignments/lesson-0/${fixture.solutionPath}`,
    );
  await workspace.save(
    session.id,
    `assignments/lesson-0/${fixture.solutionPath}`,
    fixture.instructorSolution,
    original.version,
  );
  const test = fixture.assignment.starterFiles.find((file) =>
      /^test/.test(file.path),
    )!,
    testFile = await workspace.read(
      session.id,
      `assignments/lesson-0/${test.path}`,
    );
  await workspace.save(
    session.id,
    `assignments/lesson-0/${test.path}`,
    "# altered learner test",
    testFile.version,
  );
  const sandbox = new CourseSandbox(),
    check = vi
      .spyOn(sandbox, "check")
      .mockResolvedValue({
        hash: "a".repeat(64),
        verified: true,
        image: "test-image@sha256:" + "b".repeat(64),
        at: new Date().toISOString(),
        checks: [
          {
            candidate: "submission",
            code: 0,
            tests: 2,
            output: "Two fixed cases passed",
          },
        ],
      }),
    submissions = new CourseSubmissions(app, sandbox),
    request = {
      requestId: randomUUID(),
      releaseHash: release.hash,
      expectedCount: 0,
      evidence: fixture.rubric.map(
        () => "Observed both repeated-name and empty-input results.",
      ),
      selfReviewed: true,
      runChecks: true,
    };
  const submitted = await submissions.submit(courseId, "lesson-0", request);
  expect(submitted.history[0].state).toBe("automatically_checked");
  expect(submitted.history[0].stale).toBe(false);
  expect(check.mock.calls[0][0]).toMatchObject({
    files: expect.arrayContaining([{ path: test.path, content: test.content }]),
  });
  expect(
    (await submissions.submit(courseId, "lesson-0", request)).history,
  ).toHaveLength(1);
  await expect(
    submissions.submit(courseId, "lesson-0", {
      ...request,
      evidence: fixture.rubric.map(
        () => "Different evidence after reusing a request ID.",
      ),
    }),
  ).rejects.toThrow(/different submission/);
  const current = await workspace.read(
    session.id,
    `assignments/lesson-0/${fixture.solutionPath}`,
  );
  await workspace.save(
    session.id,
    `assignments/lesson-0/${fixture.solutionPath}`,
    current.content + "\n# revision",
    current.version,
  );
  expect((await submissions.view(courseId, "lesson-0")).history[0].stale).toBe(
    true,
  );
});
