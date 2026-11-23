import { it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { Store } from "../src/server/store";
import { Application } from "../src/server/application";
import { CourseResearch } from "../src/server/course-research";
import { CourseArchive } from "../src/server/course-archive";
import { AcademyResources } from "../src/server/academy-resources";
import { Expansion } from "../src/server/expansion";
import {
  CourseSandbox,
  assertSandboxRuntime,
} from "../src/server/course-sandbox";
import { academyExample } from "../src/academy-example";
import { writtenLesson } from "./helpers/course-workshop";
let dir: string, store: Store, app: Application;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "outclass-course-infra-"));
  store = new Store(path.join(dir, "data"));
  app = new Application(store);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  store.close();
  await rm(dir, { recursive: true, force: true });
});
const reference = () => ({
  id: randomUUID(),
  title: "Dictionary accumulators",
  publisher: "Original fixture",
  authors: "Fixture educator",
  url: "https://example.org/notes",
  license: "Permission granted",
  licenseUrl: "",
  permissionNote:
    "Original fixture approved for this course and its configured AI.",
  excerpt: "Dictionary accumulators preserve earlier totals.",
  approved: true,
});
it("indexes reviewed HTML without scripts, versions changed sources and excludes revoked text", async () => {
  const research = new CourseResearch(app),
    ref = reference();
  const input = {
    reference: ref,
    topics: ["python"],
    level: "introductory",
    format: "html",
    body: "<main><h1>Dictionaries</h1><script>INJECTED_SCRIPT</script><p>A dictionary accumulator retains each person's running total.</p></main>",
    expiresOn: "",
  };
  const first = await research.ingest(input);
  expect(research.search("dictionary accumulator")).toHaveLength(1);
  expect(JSON.stringify(research.search("dictionary"))).not.toContain(
    "INJECTED_SCRIPT",
  );
  expect((await research.ingest(input)).id).toBe(first.id);
  const next = await research.ingest({
    ...input,
    body: input.body.replace("running total", "earlier accumulated minutes"),
  });
  expect(next.version).toBe(2);
  expect(research.list().filter((row) => row.active)).toHaveLength(1);
  research.revoke(next.id);
  expect(research.search("dictionary")).toHaveLength(0);
  await expect(
    research.ingest({ ...input, reference: { ...ref, approved: false } }),
  ).rejects.toThrow(/permission/);
});
it("restores a complete course and its media on a fresh device and rejects corruption", async () => {
  const resources = new AcademyResources(app),
    bytes = Buffer.from("# reviewed fixture source\n"),
    resource = {
      id: randomUUID(),
      name: "starter.py",
      kind: "code" as const,
      mime: "text/plain",
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  await resources.restore(resource, bytes);
  const course = academyExample();
  course.lessons[0].resources = [resource];
  const saved = new Expansion(app).saveCourse({
    ...course,
    expectedRevision: 0,
  });
  const archive = await new CourseArchive(app).export(saved.id);
  expect(archive).not.toHaveProperty("privateKeys");
  const target = new Store(path.join(dir, "fresh-device"));
  try {
    const fresh = new Application(target),
      importer = new CourseArchive(fresh);
    const receipt = await importer.restore(archive);
    expect((await importer.restore(archive)).id).toBe(receipt.id);
    expect(await new AcademyResources(fresh).bytes(resource)).toEqual(bytes);
    expect(new Expansion(fresh).state().courses[0].rightsConfirmed).toBe(false);
    const corrupt = structuredClone(archive);
    corrupt.resources[0].base64 = Buffer.from("changed").toString("base64");
    await expect(importer.restore(corrupt)).rejects.toThrow(/Corrupt/);
  } finally {
    target.close();
  }
});
it("requires a pinned container and verifies reference, starter and mutation in restricted commands", async () => {
  const lesson = writtenLesson(0),
    input = {
      language: "python",
      files: lesson.assignment.starterFiles,
      solution: {
        path: lesson.solutionPath,
        content: lesson.instructorSolution,
      },
      mutation: {
        path: lesson.solutionPath,
        content: lesson.faultyImplementation,
      },
    };
  await expect(new CourseSandbox().verify(input)).rejects.toThrow(
    /digest-pinned/,
  );
  vi.stubEnv(
    "OUTCLASS_PYTHON_SANDBOX_IMAGE",
    `python@sha256:${"a".repeat(64)}`,
  );
  const argsSeen: string[][] = [];
  const run = vi.fn(async (_command: string, args: string[], cwd: string) => {
    argsSeen.push(args);
    if (args[0] === "rm")
      return { code: 0, output: "", stdout: "", stderr: "" };
    if (args.includes("--version"))
      return {
        code: 0,
        output: "Python 3.12.16",
        stdout: "Python 3.12.16",
        stderr: "",
      };
    const text = await readFile(path.join(cwd, "report.py"), "utf8");
    const code = text.includes("result+=value") ? 0 : 1;
    return { code, output: "Ran 2 tests", stdout: "", stderr: "" };
  });
  const report = await new CourseSandbox(run).verify(input);
  expect(report.runtime).toBe("Python 3.12.16");
  expect(report.verified).toBe(true);
  for (const args of argsSeen.filter((args) => args[0] === "run")) {
    expect(args).toEqual(
      expect.arrayContaining([
        "--network=none",
        "--read-only",
        "--cap-drop=ALL",
        "--pids-limit=64",
        "--pull=never",
      ]),
    );
    expect(args).not.toContain("--privileged");
  }
});
it("rejects an installed runtime that does not match the authored environment", () => {
  expect(assertSandboxRuntime("python", "Python 3.12", "Python 3.12.16")).toBe(
    "Python 3.12.16",
  );
  expect(assertSandboxRuntime("javascript", "Node.js 24", "v24.10.0")).toBe(
    "v24.10.0",
  );
  expect(() =>
    assertSandboxRuntime("python", "Python 3.12", "Python 3.14.8"),
  ).toThrow(/does not match/);
  expect(() =>
    assertSandboxRuntime("javascript", "Node.js 24", "v22.1.0"),
  ).toThrow(/does not match/);
});
