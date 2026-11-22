import { expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";
import { academyExample } from "../src/academy-example";
import { courseDraft } from "../src/expansion-contract";
import { auditAcademy, importAcademy } from "../src/server/academy-studio";

it("round-trips the teaching example with a complete, ordered learning path", () => {
  const course = courseDraft.parse(academyExample());
  expect(
    importAcademy({
      name: "example.json",
      text: JSON.stringify({
        format: "outclass-academy",
        version: 1,
        course,
      }),
    }).course,
  ).toEqual(course);
  const audit = auditAcademy({
    ...course,
    rightsConfirmed: true,
    id: "example",
    revision: 1,
    updatedAt: "2026-11-21T00:00:00Z",
  });
  expect(audit.findings).toEqual([]);
  expect(audit.coverage).toMatchObject({
    lessons: 3,
    assignments: 3,
    reflections: 3,
    transfers: 3,
    milestones: 3,
  });
  expect(course.rightsConfirmed).toBe(false);
  academyExample().lessons[0].learn!.hints.length = 0;
  expect(academyExample().lessons[0].learn!.hints).toHaveLength(3);
});

it("accepts single-character examples but flags a missing value on its own line", () => {
  const course = {
    ...academyExample(),
    id: "example",
    revision: 1,
    updatedAt: "now",
  };
  course.lessons[0].practice = "Example input: []\nExpected result: 0";
  expect(
    auditAcademy(course).findings.some((f) => f.id === "0:worked-example"),
  ).toBe(false);
  course.lessons[0].practice = "Example input:\nExpected result: 0";
  expect(
    auditAcademy(course).findings.some((f) => f.id === "0:worked-example"),
  ).toBe(true);
});

// Reference implementations are test-only. Learners receive incomplete starters.
const implementations = [
  "def total_minutes(minutes):\n    total = 0\n    for value in minutes:\n        total += value\n    return total\n",
  "def summarize(records):\n    totals = {}\n    for name, minutes in records:\n        totals[name] = totals.get(name, 0) + minutes\n    return totals\n",
];
implementations.push(
  implementations[1] +
    "\ndef render_report(totals):\n    if not totals:\n        return 'No activity this week.'\n    return '\\n'.join(f'{name}: {totals[name]} min' for name in sorted(totals))\n",
);

it("executes each example's checks against incomplete, correct and plausibly wrong implementations", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "outclass-teaching-"));
  const candidates =
    process.platform === "win32" ? ["python", "py"] : ["python3", "python"];
  const python = candidates.find(
    (command) =>
      spawnSync(command, ["--version"], { timeout: 5000 }).status === 0,
  );
  expect(
    python,
    "Python 3 is required to verify the authored teaching example",
  ).toBeTruthy();
  try {
    for (const [index, lesson] of academyExample().lessons.entries()) {
      for (const file of lesson.learn!.starterFiles)
        await writeFile(path.join(folder, file.path), file.content);
      const run = () =>
        spawnSync(python!, ["-B", "-m", "unittest", "-v"], {
          cwd: folder,
          encoding: "utf8",
          timeout: 10000,
        });
      const starter = run();
      expect(starter.status).toBe(1);
      expect(starter.stderr).toContain("NotImplementedError");
      await writeFile(path.join(folder, "report.py"), implementations[index]);
      const correct = run();
      expect(correct.status, correct.stderr).toBe(0);
      // Replacement instead of accumulation, or insertion order instead of name order.
      const wrong =
        index === 0
          ? implementations[index].replace("total += value", "total = value")
          : index === 1
            ? implementations[index].replace(
                "totals.get(name, 0) + minutes",
                "minutes",
              )
            : implementations[index].replace("sorted(totals)", "totals");
      await writeFile(path.join(folder, "report.py"), wrong);
      const broken = run();
      expect(broken.status).toBe(1);
      expect(broken.stderr).toContain("AssertionError");
    }
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}, 30000);
