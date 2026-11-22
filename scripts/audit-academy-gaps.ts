import { academyExample } from "../src/academy-example";
import { courseDraft } from "../src/expansion-contract";
import { importAcademy, AcademyStudio } from "../src/server/academy-studio";
import { Expansion, validateCourse } from "../src/server/expansion";
import { Store } from "../src/server/store";
import { Application } from "../src/server/application";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const course = {
  ...academyExample(),
  rightsConfirmed: true,
  learningProject: undefined,
};
course.lessons = Array.from({ length: 9 }, (_, index) => ({
  ...academyExample().lessons[0],
  title: `Lesson ${index + 1}`,
  content: "x".repeat(30000),
  learn: undefined,
}));
for (const lesson of course.lessons) {
  const remaining = 299950 - JSON.stringify(course).length;
  if (remaining > 0)
    lesson.content += "x".repeat(
      Math.min(40000 - lesson.content.length, remaining),
    );
}
const exported = JSON.stringify(
  { format: "outclass-academy", version: 1, course },
  null,
  2,
);
let importAccepted = true;
try {
  importAcademy({ name: "export.json", text: exported });
} catch {
  importAccepted = false;
}
const results: Record<string, unknown> = {
  boundaryExport: {
    schemaValid: courseDraft.safeParse(course).success,
    releaseValid: validateCourse(course).valid,
    compactChars: JSON.stringify(course).length,
    exportedChars: exported.length,
    importAccepted,
  },
};
const folder = await mkdtemp(path.join(tmpdir(), "outclass-audit-"));
const store = new Store(folder);
try {
  const app = new Application(store),
    expansion = new Expansion(app),
    studio = new AcademyStudio(app, expansion);
  const draft = { ...academyExample(), rightsConfirmed: true };
  draft.lessons[0].learn!.hints = [];
  const saved = expansion.saveCourse({ ...draft, expectedRevision: 0 });
  const audit = studio.audit(saved.id);
  const release = expansion.release(saved.id, {
    expectedRevision: saved.revision,
    approve: true,
  });
  results.releaseReview = {
    reviewReceipt: !!audit.review,
    reviewFindings: audit.findings.filter(
      (finding) => finding.level === "review",
    ).length,
    lowLevelReleaseSucceeded: !!release.id,
  };
} finally {
  store.close();
  await rm(folder, { recursive: true, force: true });
}
textOutput();
function textOutput() {
  console.log(JSON.stringify(results, null, 2));
}
