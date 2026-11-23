import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse } from "dotenv";
import { Store } from "../src/server/store";
import { Application } from "../src/server/application";
import { CourseWorkshop } from "../src/server/course-workshop";
if (!process.argv.includes("--live"))
  throw new Error(
    "Pass --live to authorize up to 24 provider stages and isolated checks on this original evaluation course.",
  );
const filename = process.argv[process.argv.indexOf("--job") + 1];
if (
  !filename ||
  !path
    .resolve(filename)
    .startsWith(path.resolve(".local/academy-evaluations") + path.sep)
)
  throw new Error("Choose an ignored Academy evaluation job file.");
const original = JSON.parse(await readFile(filename, "utf8")),
  technical = JSON.parse(
    await readFile(
      filename.replace(/\.json$/, "-technical.json"),
      "utf8",
    ).catch(() =>
      JSON.stringify(
        Object.entries(original.verification || {}).map(
          ([lessonId, report]) => ({ lessonId, ...(report as object) }),
        ),
      ),
    ),
  ),
  settings = parse(await readFile(".local/ai-service.env"));
process.env.OPENAI_CHAT_MODEL =
  process.env.OUTCLASS_EVAL_MODEL || "gpt-5.4-2026-03-05";
process.env.OUTCLASS_SANDBOX_BACKEND = "vercel";
const directory = await mkdtemp(path.join(tmpdir(), "outclass-course-repair-")),
  store = new Store(path.join(directory, "data")),
  app = new Application(store, settings.OPENAI_API_KEY);
if (process.argv.includes("--continue"))
  store.put("academy:course-jobs:v1", [original]);
const workshop = new CourseWorkshop(app),
  started = Date.now();
let job = process.argv.includes("--continue")
  ? workshop.get(original.id)
  : workshop.restore(
      { format: "outclass-course-workshop", version: 1, job: original },
      24,
    );
const output = `.local/academy-evaluations/${job.id}.json`;
const approvedBudget = Math.min(100, job.calls + 24),
  editorial = process.argv.includes("--editorial");
try {
  if (!job.planAccepted) job = workshop.acceptPlan(job.id, job.revision);
  for (const planned of job.plan!.lessons) {
    if (job.verification?.[planned.id]?.verified && !editorial) {
      console.log(`Retaining verified ${planned.id}`);
      continue;
    }
    const report = technical.find((row: any) => row.lessonId === planned.id);
    const comments =
      original.critique?.findings
        .filter(
          (finding: any) =>
            finding.lessonId === planned.id &&
            !/leak|non-existent lesson id|metadata violates/.test(
              finding.claim,
            ),
        )
        .map((finding: any) => finding.correction) || [];
    job = workshop.configure(job.id, job.revision, {
      approveProvider: true,
      maxCalls: approvedBudget,
      feedback:
        `Repair this milestone so its documented setup and all supplied tests work in a CLEAN assignment folder. No earlier project files are automatically present. The reference must pass, the starter must fail, and a genuinely faulty distinct implementation must fail. Preserve the accepted plan's scope. Editorial feedback: ${comments.join(" ")} Observed isolated results: ${JSON.stringify(report?.checks.map((check: any) => ({ candidate: check.candidate, exitCode: check.code, outputExcerpt: check.output.slice(-900) })) || report?.error)}`.slice(
          0,
          4000,
        ),
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      console.log(`Repairing ${planned.id}, attempt ${attempt + 1}`);
      job = await workshop.next(job.id, job.revision, planned.id);
      if (job.phase === "failed") {
        console.log(job.error);
        continue;
      }
      job = await workshop.verify(job.id, job.revision, planned.id);
      console.log(
        `${planned.id}: verified=${job.verification?.[planned.id]?.verified} ${job.error || ""}`,
      );
      await writeFile(output, JSON.stringify(job, null, 2));
      if (job.verification?.[planned.id]?.verified) break;
    }
  }
  while (job.calls < job.maxCalls && !job.critique) {
    job = await workshop.next(job.id, job.revision);
    console.log(`Critique stage ${job.calls}: ${job.phase}`);
    if (job.phase === "failed") break;
  }
  await writeFile(output, JSON.stringify(job, null, 2));
  const report = {
    id: job.id,
    model: process.env.OPENAI_CHAT_MODEL,
    elapsedMs: Date.now() - started,
    calls: job.calls,
    lessons: Object.keys(job.lessons).length,
    technical: Object.entries(job.verification || {}).map(
      ([lessonId, report]) => ({
        lessonId,
        verified: report.verified,
        image: report.image,
        runtime: report.runtime,
        checks: report.checks.map(({ candidate, code, tests }) => ({
          candidate,
          code,
          tests,
        })),
      }),
    ),
    critique: job.critique || null,
    error: job.error || null,
  };
  await writeFile(
    output.replace(/\.json$/, "-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      id: job.id,
      calls: job.calls,
      verified: report.technical.filter((row) => row.verified).length,
      blockers: job.critique?.findings.filter((f) => f.severity === "blocker")
        .length,
    }),
  );
} finally {
  workshop.stop();
  store.close();
  if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()))
    throw Error("Unexpected temporary path");
  await rm(directory, { recursive: true, force: true });
}
