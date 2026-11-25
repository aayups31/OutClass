import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Store } from "../src/server/store";
import { Application } from "../src/server/application";
import { CourseWorkshop } from "../src/server/course-workshop";
import { Expansion } from "../src/server/expansion";
import { CourseAssessment } from "../src/server/course-assessment";
import { CourseSandbox } from "../src/server/course-sandbox";
import {
  validatePlan,
  validateWrittenLesson,
} from "../src/course-workshop-quality";
import {
  workshopBrief,
  workshopPlan,
  writtenLesson,
} from "./helpers/course-workshop";
let directory: string, store: Store, app: Application, workshop: CourseWorkshop;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "outclass-course-workshop-"));
  store = new Store(path.join(directory, "data"));
  app = new Application(store, "synthetic-key");
  await app.setup(path.join(directory, "history"), false);
  workshop = new CourseWorkshop(app);
});
afterEach(async () => {
  workshop.stop();
  vi.restoreAllMocks();
  store.close();
  await rm(directory, { recursive: true, force: true });
});
it("rejects impossible prerequisite and workload plans and invalid assessment keys", () => {
  expect(validatePlan(workshopBrief, workshopPlan)).toEqual([]);
  const bad = structuredClone(workshopPlan);
  bad.lessons[0].prerequisiteIds = ["report"];
  bad.lessons[0].uses = ["untaught framework"];
  bad.lessons[0].minutes = 240;
  expect(validatePlan(workshopBrief, bad).map((row) => row.id)).toEqual(
    expect.arrayContaining(["total:order", "total:skills", "workload"]),
  );
  const lesson = writtenLesson(0);
  lesson.answerKeys[0].correctChoice = 5;
  expect(
    validateWrittenLesson(workshopPlan, 0, lesson, []).some((row) =>
      row.id.includes("key:"),
    ),
  ).toBe(true);
});
it("plans, writes, independently critiques and delivers a complete course without leaking keys", async () => {
  const webSource = {
    id: "web:9f570acddd4a8593",
    title: "MIT OCW · Programming in Python",
    url: "https://ocw.mit.edu/courses/6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016/",
    text: "Start by tracing one repeated value before learners generalize an accumulation rule.",
  };
  const search = vi
    .spyOn(app.ai, "academyResearch")
    .mockResolvedValue([webSource]);
  const provider = vi
    .spyOn(app.ai, "structured")
    .mockImplementation(async (options) => {
      const context = JSON.parse(options.context);
      expect(context.sources).toContainEqual(webSource);
      if (options.task === "course_plan")
        return {
          ...structuredClone(workshopPlan),
          rationale: `${workshopPlan.rationale} Start with traces [${webSource.id}].`,
        };
      if (options.task === "course_lesson")
        return {
          ...writtenLesson(context.index),
          sourceIds: [webSource.id],
          grounding: [
            {
              sourceId: webSource.id,
              claim: "The practice starts with one trace.",
              quote: webSource.text,
            },
          ],
        };
      return { findings: [], limitations: ["No code execution was supplied."] };
    });
  let job = workshop.create({
    brief: workshopBrief,
    maxCalls: 10,
    approveProvider: true,
    researchWeb: true,
  });
  job = await workshop.next(job.id, job.revision);
  expect(job.planAccepted).toBe(false);
  await expect(workshop.next(job.id, job.revision)).rejects.toThrow(/accept/i);
  job = workshop.acceptPlan(job.id, job.revision);
  for (let index = 0; index < 6; index++)
    job = await workshop.next(job.id, job.revision);
  expect(job.phase).toBe("ready");
  expect(provider).toHaveBeenCalledTimes(7);
  expect(search).toHaveBeenCalledTimes(1);
  expect(job.calls).toBe(8);
  expect(() => workshop.deliver(job.id, job.revision, true)).toThrow(
    /Verify each/,
  );
  vi.spyOn(CourseSandbox.prototype, "verify").mockResolvedValue({
    hash: "a".repeat(64),
    verified: true,
    image: "fixture@sha256:" + "b".repeat(64),
    at: new Date().toISOString(),
    checks: [
      {
        candidate: "reference",
        code: 0,
        tests: 2,
        output: "Controlled workflow fixture",
      },
    ],
  });
  for (const lesson of job.plan!.lessons)
    job = await workshop.verify(job.id, job.revision, lesson.id);
  job = workshop.deliver(job.id, job.revision, true);
  expect(workshop.deliver(job.id, job.revision, true).delivery).toEqual(
    job.delivery,
  );
  const expansion = new Expansion(app),
    saved = expansion.state().courses[0];
  expect(saved.lessons).toHaveLength(3);
  expect(saved.lessons[0].content).toContain(webSource.url);
  expect(saved.design?.plan.outcomes).toHaveLength(2);
  expect(JSON.stringify(saved)).not.toContain("correctChoice");
  expect(JSON.stringify(saved)).not.toContain("instructorSolution");
  const { id, revision, updatedAt: _, ...draft } = saved;
  const approved = expansion.saveCourse({
    ...draft,
    id,
    expectedRevision: revision,
    rightsConfirmed: true,
  });
  const release = expansion.release(id, {
    expectedRevision: approved.revision,
    approve: true,
  });
  expansion.enroll(release.id);
  const launch = await expansion.launch(release.id, 0);
  let date = new Date("2026-11-22T12:00:00Z");
  const assessment = new CourseAssessment(app, () => date);
  const view = assessment.view(launch.courseId, "lesson-0");
  expect(JSON.stringify(view)).not.toContain("correctChoice");
  const item = view.items[0];
  expect(item.automaticCheckAvailable).toBe(true);
  const response = await assessment.submit(launch.courseId, "lesson-0", {
    itemId: item.id,
    choice: 0,
    releaseHash: release.hash,
    expectedAttempt: 0,
  });
  expect(response.correct).toBe(true);
  expect(assessment.view(launch.courseId, "lesson-0").items[0].due).toBe(false);
  date = new Date("2026-11-24T12:00:00Z");
  expect(assessment.view(launch.courseId, "lesson-0").items[0].due).toBe(true);
  await expect(
    assessment.submit(launch.courseId, "lesson-0", {
      itemId: item.id,
      choice: 0,
      releaseHash: release.hash,
      expectedAttempt: 0,
    }),
  ).rejects.toThrow(/already/);
});
it("retains accepted lessons on restart and invalidates critique after selective editing", async () => {
  let job = workshop.create({
    brief: workshopBrief,
    maxCalls: 10,
    approveProvider: true,
  });
  job = workshop.acceptPlan(job.id, job.revision, workshopPlan);
  vi.spyOn(app.ai, "structured").mockResolvedValue(writtenLesson(0));
  job = await workshop.next(job.id, job.revision);
  const restored = new CourseWorkshop(app);
  expect(restored.get(job.id).lessons.total.summary).toBe(
    job.lessons.total.summary,
  );
  const lesson = structuredClone(job.lessons.total);
  lesson.sections[0].body += " A changed constraint must be explained.";
  job = restored.editLesson(job.id, job.revision, lesson);
  expect(job.history).toHaveLength(1);
  expect(job.critique).toBeUndefined();
  expect(() => restored.editLesson(job.id, job.revision - 1, lesson)).toThrow(
    /changed/,
  );
});
it("discards a canceled in-flight generation without spending another call", async () => {
  let resolve: (value: unknown) => void = () => {};
  vi.spyOn(app.ai, "structured").mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const job = workshop.create({
    brief: workshopBrief,
    maxCalls: 10,
    approveProvider: true,
  });
  const pending = workshop.next(job.id, job.revision);
  workshop.cancel(job.id);
  resolve(workshopPlan);
  const canceled = await pending;
  expect(canceled.phase).toBe("interrupted");
  expect(canceled.plan).toBeUndefined();
  expect(canceled.calls).toBe(1);
});
