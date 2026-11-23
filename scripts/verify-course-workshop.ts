import { readFile, writeFile } from "node:fs/promises";
import { CourseSandbox } from "../src/server/course-sandbox";
import {
  courseBrief,
  courseLessonAnswer,
  coursePlan,
} from "../src/course-workshop-contract";
import path from "node:path";
if (!process.argv.includes("--live-sandbox"))
  throw new Error(
    "Pass --live-sandbox to authorize network-disabled remote checks of this original course's starter, reference and deliberate mistakes.",
  );
const filename = process.argv[process.argv.indexOf("--job") + 1];
if (
  !filename ||
  !path
    .resolve(filename)
    .startsWith(path.resolve(".local/academy-evaluations") + path.sep)
)
  throw new Error("Choose an ignored Academy evaluation job file.");
const raw = JSON.parse(await readFile(filename, "utf8")),
  brief = courseBrief.parse(raw.brief),
  plan = coursePlan.parse(raw.plan);
if (brief.language === "other")
  throw new Error("Choose a supported coding language.");
process.env.OUTCLASS_SANDBOX_BACKEND = "vercel";
const reports = [];
for (const planned of plan.lessons) {
  console.log(`Verifying ${planned.id}: ${planned.title}`);
  const lesson = courseLessonAnswer.parse(raw.lessons[planned.id]);
  try {
    const report = await new CourseSandbox().verify({
      language: brief.language,
      runtime: brief.runtime,
      files: lesson.assignment.starterFiles,
      solution: {
        path: lesson.solutionPath,
        content: lesson.instructorSolution,
      },
      mutation: {
        path: lesson.solutionPath,
        content: lesson.faultyImplementation,
      },
    });
    reports.push({ lessonId: planned.id, ...report });
    console.log(
      `${planned.id}: ${report.verified ? "reference passes; starter and mutation rejected" : "checks need repair"} · ${report.runtime}`,
    );
  } catch (error) {
    reports.push({
      lessonId: planned.id,
      verified: false,
      error: (error as Error).message,
    });
    console.log(`${planned.id}: ${(error as Error).message}`);
  }
  await writeFile(
    filename.replace(/\.json$/, "-technical.json"),
    JSON.stringify(reports, null, 2),
  );
}
console.log(
  JSON.stringify({
    lessons: reports.length,
    verified: reports.filter((row) => row.verified).length,
  }),
);
if (reports.some((row) => !row.verified)) process.exitCode = 1;
