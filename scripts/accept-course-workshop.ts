import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../src/server/store";
import { Application } from "../src/server/application";
import { CourseWorkshop, type CourseJob } from "../src/server/course-workshop";
import { Expansion } from "../src/server/expansion";
import { AcademyStudio } from "../src/server/academy-studio";
import { CourseArchive } from "../src/server/course-archive";
import { LearnDelivery } from "../src/server/learn-delivery";
import { CourseAssessment } from "../src/server/course-assessment";
import { HostedAcademy } from "../services/ai/academy";
import { HostedAcademyTransfer } from "../services/ai/academy-transfer";
import { HostedCourseAssessment } from "../services/ai/academy-assessment";
import { hostedAcademyDatabase } from "../tests/helpers/hosted-academy-db";
import {
  workshopBrief,
  workshopPlan,
  writtenLesson,
} from "../tests/helpers/course-workshop";
import { contentHash } from "../src/course-integrity";

const fixture = process.argv.includes("--fixture"),
  input = process.argv[process.argv.indexOf("--job") + 1];
if (
  !fixture &&
  (!process.argv.includes("--job") ||
    !input ||
    !path
      .resolve(input)
      .startsWith(path.resolve(".local/academy-evaluations") + path.sep))
)
  throw Error(
    "Use --fixture for the deterministic CI journey, or --job .local/academy-evaluations/<id>.json to accept an already verified private live-model artifact. This runner makes no provider or VM calls.",
  );
const root = await mkdtemp(path.join(tmpdir(), "outclass-course-acceptance-")),
  stores: Store[] = [],
  database = await hostedAcademyDatabase(),
  service = new HostedAcademy(database.pool),
  author = randomUUID(),
  learner = randomUUID();
const phases: string[] = [];
async function workspace(name: string) {
  const store = new Store(path.join(root, name, "data"));
  stores.push(store);
  const app = new Application(store);
  await app.setup(path.join(root, name, "history"), false);
  return app;
}
function reviewed(app: Application, id: string) {
  const expansion = new Expansion(app),
    draft = expansion.state().courses.find((course) => course.id === id)!;
  const { revision, updatedAt: _, ...course } = draft;
  const saved = expansion.saveCourse({
      ...course,
      expectedRevision: revision,
      rightsConfirmed: true,
    }),
    studio = new AcademyStudio(app, expansion),
    audit = studio.audit(saved.id);
  assert.equal(audit.findings.filter((f) => f.level === "blocker").length, 0);
  studio.review(saved.id, {
    expectedRevision: saved.revision,
    hash: audit.hash,
    acknowledged: audit.findings
      .filter((f) => f.level === "review")
      .map((f) => f.id),
    approve: true,
  });
  return studio.release(saved.id, {
    expectedRevision: saved.revision,
    reviewHash: audit.hash,
    approve: true,
  });
}
try {
  const app = await workspace("author");
  let job: CourseJob;
  if (fixture) {
    const workshop = new CourseWorkshop(app);
    job = workshop.create({
      brief: workshopBrief,
      maxCalls: 10,
      approveProvider: true,
    });
    job = workshop.acceptPlan(job.id, job.revision, workshopPlan);
    job.lessons = Object.fromEntries(
      workshopPlan.lessons.map((lesson, index) => [
        lesson.id,
        writtenLesson(index),
      ]),
    );
    job.critique = {
      findings: [],
      limitations: [
        "Deterministic workflow fixture; live course quality is evaluated separately.",
      ],
    };
    job.phase = "ready";
    const digest = (await import("node:crypto")).createHash;
    job.verification = Object.fromEntries(
      workshopPlan.lessons.map((lesson) => [
        lesson.id,
        {
          hash: "a".repeat(64),
          verified: true,
          image: "fixture-only@sha256:" + "b".repeat(64),
          at: new Date().toISOString(),
          checks: [],
          lessonHash: digest("sha256")
            .update(JSON.stringify(job.lessons[lesson.id]))
            .digest("hex"),
        },
      ]),
    );
  } else job = JSON.parse(await readFile(input, "utf8"));
  // Replaying our own ignored evaluation evidence preserves its hashes; portable user imports deliberately clear these approvals.
  app.store.put("academy:course-jobs:v1", [job]);
  const workshop = new CourseWorkshop(app);
  job = workshop.deliver(job.id, job.revision, true);
  assert.ok(job.delivery);
  const release = reviewed(app, job.delivery.id);
  phases.push("verified workshop → reviewed immutable release");
  const archive = await new CourseArchive(app).export(job.delivery.id, true),
    fresh = await workspace("restored-author"),
    restored = await new CourseArchive(fresh).restore(archive),
    restoredRelease = reviewed(fresh, restored.id);
  assert.equal(
    contentHash(release.lessons),
    contentHash(restoredRelease.lessons),
  );
  phases.push("private portable backup → clean author workspace");
  const expansion = new Expansion(fresh),
    keys =
      fresh.store.get<any[]>(`academy:assessment-keys:${restoredRelease.id}`) ||
      [];
  assert.ok(keys.length);
  let localLessons = 0;
  expansion.enroll(restoredRelease.id);
  for (let index = 0; index < restoredRelease.lessons.length; index++) {
    const launch = await expansion.launch(restoredRelease.id, index),
      view = new LearnDelivery(fresh).snapshot(
        launch.courseId,
        `lesson-${index}`,
      );
    assert.ok(view);
    assert.equal(view.content, restoredRelease.lessons[index].content);
    const assessment = new CourseAssessment(fresh),
      questions = assessment.view(launch.courseId, `lesson-${index}`);
    assert.ok(questions.items.length);
    assert.ok(!JSON.stringify(view).includes('"correctChoice"'));
    await fresh.sessionAction("discard");
    localLessons++;
  }
  phases.push(`opened all ${localLessons} lessons and assessments in Learn`);
  // Route the unmodified desktop publication/download clients into the real scoped PostgreSQL service.
  fresh.ai.platform = (async (route, body: any) => {
    if (route === "publish") return service.publish(author, body);
    if (route === "transfers")
      return new HostedAcademyTransfer(service).begin(author, body);
    const match = /^transfers\/([^/]+)\/(chunk|publish)$/.exec(route);
    if (match)
      return match[2] === "chunk"
        ? new HostedAcademyTransfer(service).chunk(author, match[1], body)
        : new HostedAcademyTransfer(service).publish(author, match[1]);
    throw Error(`Unexpected author route ${route}`);
  }) as typeof fresh.ai.platform;
  const published = (await expansion.publishHosted(restoredRelease.id)) as {
    id: string;
  };
  assert.equal(published.id, restoredRelease.id);
  await service.enroll(learner, published.id);
  phases.push(
    "desktop publish → scoped hosted PostgreSQL → synthetic enrollment",
  );
  const downloaded = await workspace("learner"),
    learnerExpansion = new Expansion(downloaded);
  downloaded.ai.platform = (async (route, body: any) => {
    if (route === "redeem") return service.redeem(learner, body.grant);
    let match = /^courses\/([^/]+)\/lessons\/(\d+)\/chunks\/(\d+)$/.exec(route);
    if (match)
      return service.lessonChunk(
        learner,
        match[1],
        Number(match[2]),
        Number(match[3]),
      );
    const media = /^media\/([^/]+)\/chunks\/(\d+)$/.exec(route);
    if (media) return service.media.read(learner, media[1], Number(media[2]));
    throw Error(`Unexpected learner route ${route}`);
  }) as typeof downloaded.ai.platform;
  const grant = await service.grant(learner, published.id, 0),
    launched = await learnerExpansion.importHosted(grant.grant);
  assert.equal(
    new LearnDelivery(downloaded).snapshot(launched.courseId, "lesson-0")
      ?.content,
    restoredRelease.lessons[0].content,
  );
  assert.equal(
    downloaded.store.get(`academy:assessment-keys:${restoredRelease.id}`),
    undefined,
  );
  const first = keys[0],
    graded = await new HostedCourseAssessment(service).submit(
      learner,
      published.id,
      {
        requestId: randomUUID(),
        itemId: first.itemId,
        choice: first.correctChoice,
        expectedAttempt: 0,
      },
    );
  assert.ok(graded.correct);
  phases.push(
    "single-use grant → clean learner download → private server grading",
  );
  const report = {
    at: new Date().toISOString(),
    mode: fixture
      ? "deterministic fixture"
      : "existing live-model course with isolated verification receipts",
    jobId: job.id,
    lessons: localLessons,
    phases,
    productionWrites: false,
    providerCalls: 0,
    newSandboxRuns: 0,
    limitations: [
      "Embedded PostgreSQL validates production SQL/RLS, not deployed HTTP/auth/installer behavior.",
      "No educator or learner trial is implied.",
    ],
  };
  await mkdir(".local/academy-evaluations", { recursive: true });
  await writeFile(
    `.local/academy-evaluations/acceptance-${job.id}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  for (const store of stores) store.close();
  await database.close();
  await rm(root, { recursive: true, force: true });
}
