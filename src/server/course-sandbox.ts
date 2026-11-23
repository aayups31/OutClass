import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { starterPath } from "../learn-package-contract.js";
import { productionProcess } from "./production-process.js";
import { UserError, assertClean } from "./safety.js";
const file = z
  .object({ path: starterPath, content: z.string().max(40000) })
  .strict();
export const sandboxRequest = z
  .object({
    language: z.enum(["python", "javascript"]),
    runtime: z.string().max(100).optional(),
    files: z.array(file).min(2).max(20),
    solution: file,
    mutation: file,
  })
  .strict();
export type SandboxReport = {
  hash: string;
  verified: boolean;
  image: string;
  runtime?: string;
  at: string;
  checks: {
    candidate: string;
    code: number | null;
    tests: number;
    output: string;
  }[];
};
type Runner = typeof productionProcess;
export function sandboxTestArgs(
  language: "python" | "javascript",
  files: { path: string }[],
) {
  const tests = files
    .map((file) => file.path)
    .filter((path) =>
      language === "python"
        ? /(^|\/)test[^/]*\.py$/.test(path)
        : /\.test\.[cm]?js$/.test(path),
    );
  if (!tests.length)
    throw new UserError(
      "Include discoverable behavioral test files for this runtime.",
    );
  return language === "python"
    ? ["-B", "-m", "unittest", "-v"]
    : ["--test", ...tests];
}
export class CourseSandbox {
  constructor(private execute: Runner = productionProcess) {}
  async verify(raw: unknown): Promise<SandboxReport> {
    return this.run(raw, false);
  }
  async check(raw: unknown): Promise<SandboxReport> {
    const input = z
        .object({
          language: z.enum(["python", "javascript"]),
          runtime: z.string().max(100).optional(),
          files: z.array(file).min(2).max(20),
          sourcePath: starterPath,
        })
        .strict()
        .parse(raw),
      source = input.files.find((file) => file.path === input.sourcePath);
    if (!source) throw new UserError("The submitted source file is missing.");
    const { sourcePath: _, ...request } = input;
    return this.run({ ...request, solution: source, mutation: source }, true);
  }
  private async run(raw: unknown, submission: boolean): Promise<SandboxReport> {
    const input = sandboxRequest.parse(raw);
    if (
      input.files.reduce((sum, file) => sum + file.content.length, 0) > 200000
    )
      throw new UserError(
        "Keep a verification package under 200,000 characters.",
      );
    const names = input.files.map((file) => file.path.toLowerCase());
    if (
      new Set(names).size !== names.length ||
      names.some((name) => names.some((other) => other.startsWith(name + "/")))
    )
      throw new UserError(
        "Use distinct file paths without file/folder collisions.",
      );
    if (
      !input.files.some((file) => file.path === input.solution.path) ||
      input.solution.path !== input.mutation.path
    )
      throw new UserError(
        "Solution and mutation must replace the same existing learner source file.",
      );
    const testArgs = sandboxTestArgs(input.language, input.files);
    assertClean(JSON.stringify(input), "course verification files");
    const candidates: readonly (readonly [
      string,
      { path: string; content: string } | null,
    ])[] = submission
      ? [["submission", null]]
      : [
          ["starter", null],
          ["reference", input.solution],
          ["mutation", input.mutation],
        ];
    if (process.env.OUTCLASS_SANDBOX_BACKEND === "vercel") {
      const { remoteCourseChecks } = await import("./course-remote-sandbox.js");
      const report = await remoteCourseChecks(
        input.language,
        input.files,
        candidates,
        input.runtime,
      );
      return {
        ...report,
        hash: createHash("sha256").update(JSON.stringify(input)).digest("hex"),
        at: new Date().toISOString(),
        verified:
          report.checks.every((check) => check.tests > 0) &&
          (submission
            ? report.checks[0]?.code === 0
            : report.checks.find((check) => check.candidate === "reference")
                ?.code === 0 &&
              report.checks
                .filter((check) => check.candidate !== "reference")
                .every((check) => check.code !== 0)),
      };
    }
    const image =
      process.env[
        input.language === "python"
          ? "OUTCLASS_PYTHON_SANDBOX_IMAGE"
          : "OUTCLASS_NODE_SANDBOX_IMAGE"
      ] || "";
    if (!/^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$/.test(image))
      throw new UserError(
        "Configure a digest-pinned sandbox image and Docker before checking generated code. Host execution is never used as a fallback.",
        503,
      );
    const dir = await mkdtemp(path.join(tmpdir(), "outclass-sandbox-"));
    const checks: SandboxReport["checks"] = [];
    try {
      for (const [candidate, replacement] of candidates) {
        for (const entry of input.files) {
          const current =
            replacement && entry.path === replacement.path
              ? replacement
              : entry;
          const filename = path.join(dir, ...entry.path.split("/"));
          await mkdir(path.dirname(filename), { recursive: true });
          await writeFile(filename, current.content);
        }
        const name = `outclass-check-${randomUUID()}`;
        const args = [
          "run",
          "--rm",
          "--pull=never",
          "--name",
          name,
          "--network=none",
          "--read-only",
          "--cap-drop=ALL",
          "--security-opt=no-new-privileges",
          "--user=65534:65534",
          "--memory=256m",
          "--memory-swap=256m",
          "--cpus=1",
          "--pids-limit=64",
          "--tmpfs=/tmp:rw,noexec,nosuid,size=32m",
          "--mount",
          `type=bind,source=${dir},target=/workspace,readonly`,
          "--workdir=/workspace",
          image,
          ...(input.language === "python"
            ? ["python", ...testArgs]
            : ["node", ...testArgs]),
        ];
        try {
          const result = await this.execute("docker", args, dir, 15000);
          const count =
            input.language === "python"
              ? /Ran (\d+) tests?/.exec(result.output)
              : /# tests (\d+)/.exec(result.output);
          checks.push({
            candidate,
            code: result.code,
            tests: Number(count?.[1] || 0),
            output: result.output.slice(-20000),
          });
        } finally {
          await this.execute("docker", ["rm", "-f", name], dir, 5000).catch(
            () => {},
          );
        }
      }
      return {
        hash: createHash("sha256").update(JSON.stringify(input)).digest("hex"),
        verified:
          checks.every((check) => check.tests > 0) &&
          (submission
            ? checks[0]?.code === 0
            : checks.find((check) => check.candidate === "reference")?.code ===
                0 &&
              checks
                .filter((check) => check.candidate !== "reference")
                .every((check) => check.code !== 0)),
        image,
        at: new Date().toISOString(),
        checks,
      };
    } finally {
      if (path.dirname(path.resolve(dir)) !== path.resolve(tmpdir()))
        throw new Error("Unexpected temporary sandbox path");
      await rm(dir, { recursive: true, force: true });
    }
  }
}
