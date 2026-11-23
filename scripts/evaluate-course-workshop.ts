import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse } from "dotenv";
import { Store } from "../src/server/store";
import { Application } from "../src/server/application";
import { CourseWorkshop } from "../src/server/course-workshop";
import {
  validatePlan,
  validateWrittenLesson,
} from "../src/course-workshop-quality";
import {
  courseBrief,
  courseWritingConstraints,
  courseEditorialConstraints,
} from "../src/course-workshop-contract";
import { contentHash } from "../src/course-integrity";

if (!process.argv.includes("--live"))
  throw new Error(
    "Use --live to authorize a bounded evaluation (2 × lessons + 5 calls) on an original brief. Optional --case selects scripts/academy-evaluation-cases.json. Private solutions remain in .local.",
  );
const settings = parse(await readFile(".local/ai-service.env")),
  key = settings.OPENAI_API_KEY;
if (!key)
  throw new Error("Configure a personal provider key for live evaluation.");
process.env.OPENAI_CHAT_MODEL =
  process.env.OUTCLASS_EVAL_MODEL ||
  settings.OPENAI_CHAT_MODEL ||
  "gpt-4o-mini";
const directory = await mkdtemp(path.join(tmpdir(), "outclass-live-course-")),
  store = new Store(path.join(directory, "data")),
  app = new Application(store, key),
  workshop = new CourseWorkshop(app);
const defaultBrief = {
  title: "Reliable weekly reports for a volunteer club",
  audience:
    "Python learners who can define a function and iterate a list but have not built a complete tool",
  startingSkills: ["functions", "loops", "lists"],
  outcome:
    "Independently build and test a reproducible weekly activity report, diagnose incorrect totals, and explain input and presentation decisions",
  deliverable:
    "A local standard-library Python reporting tool with fixtures, tests, clear output and a handover README",
  constraints:
    "Python 3.12 standard library only; name/minutes records; no accounts; small deterministic fixtures; use exact skill strings consistently",
  exclusions:
    "Web frameworks, databases, machine learning, deployment, external packages and actual personal data",
  hours: 10,
  lessonCount: 6,
  language: "python" as const,
  runtime: "Python 3.12",
};
const cases = JSON.parse(
  await readFile("scripts/academy-evaluation-cases.json", "utf8"),
) as { id: string; brief: unknown; reviewChecks: string[] }[];
const caseIndex = process.argv.indexOf("--case"),
  selected = cases.find(
    (row) =>
      row.id ===
      (caseIndex >= 0 ? process.argv[caseIndex + 1] : "volunteer-reports"),
  );
if (!selected)
  throw Error("Choose a case ID from scripts/academy-evaluation-cases.json.");
const brief = courseBrief.parse(selected.brief || defaultBrief),
  started = Date.now(),
  stageTimes: { call: number; milliseconds: number; phase: string }[] = [];
let job = workshop.create({
  brief,
  maxCalls: 2 * brief.lessonCount + 5,
  approveProvider: true,
});
try {
  while (job.calls < job.maxCalls && !job.critique) {
    console.log(
      `Starting stage ${job.calls + 1}; ${Object.keys(job.lessons).length}/${brief.lessonCount} lessons saved.`,
    );
    const stageStart = Date.now();
    job = await workshop.next(job.id, job.revision);
    stageTimes.push({
      call: job.calls,
      milliseconds: Date.now() - stageStart,
      phase: job.phase,
    });
    if (job.phase === "failed") {
      console.log(`Stage needs attention: ${job.error}`);
      continue;
    }
    if (job.plan && !job.planAccepted)
      job = workshop.acceptPlan(job.id, job.revision);
    await mkdir(".local/academy-evaluations", { recursive: true });
    await writeFile(
      `.local/academy-evaluations/${job.id}.json`,
      JSON.stringify(job, null, 2),
    );
  }
  const report = {
    caseId: selected.id,
    model: process.env.OPENAI_CHAT_MODEL,
    provider: "personal OpenAI-compatible provider",
    promptHash: contentHash({
      courseWritingConstraints,
      courseEditorialConstraints,
    }),
    durationMilliseconds: Date.now() - started,
    stageTimes,
    reviewChecks: selected.reviewChecks,
    limitations: [
      "Model critique and deterministic checks are separate evidence; neither proves learning effectiveness.",
      "No token-cost estimate is inferred from call counts. Verify actual usage in provider billing.",
      "Run each case repeatedly for every supported configured provider before making reliability-rate claims.",
    ],
    id: job.id,
    phase: job.phase,
    calls: job.calls,
    lessons: Object.keys(job.lessons).length,
    planFindings: job.plan ? validatePlan(brief, job.plan) : ["no plan"],
    lessonFindings: job.plan
      ? job.plan.lessons.flatMap((lesson, index) =>
          job.lessons[lesson.id]
            ? validateWrittenLesson(
                job.plan!,
                index,
                job.lessons[lesson.id],
                (job.evidence[lesson.id] || []).map((source) => source.id),
                job.evidence[lesson.id] || [],
              )
            : [{ id: lesson.id, detail: "not written" }],
        )
      : [],
    critique: job.critique || null,
    error: job.error || null,
    technicalExecution: "not_run",
  };
  await mkdir(".local/academy-evaluations", { recursive: true });
  await writeFile(
    `.local/academy-evaluations/${job.id}.json`,
    JSON.stringify(job, null, 2),
  );
  await writeFile(
    `.local/academy-evaluations/${job.id}-report.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  if (job.phase === "failed") process.exitCode = 1;
} finally {
  workshop.stop();
  store.close();
  if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()))
    throw Error("Unexpected temporary path");
  await rm(directory, { recursive: true, force: true });
}
