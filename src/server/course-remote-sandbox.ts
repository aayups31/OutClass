import { Sandbox } from "@vercel/sandbox";
import { Writable } from "node:stream";
import type { SandboxReport } from "./course-sandbox.js";
import { sandboxTestArgs, assertSandboxRuntime } from "./course-sandbox.js";
import { UserError } from "./safety.js";
export async function remoteCourseChecks(
  language: "python" | "javascript",
  files: { path: string; content: string }[],
  candidates: readonly (readonly [
    string,
    { path: string; content: string } | null,
  ])[],
  requestedRuntime?: string,
) {
  let image =
    process.env.OUTCLASS_VERCEL_SANDBOX_IMAGE ||
    (language === "python"
      ? "vercel/sandbox/python:3.14"
      : "vercel/sandbox/node:24");
  let runtime = "";
  let pythonVersion =
    language === "python"
      ? /\b(3\.(?:12|13|14)(?:\.\d+)?)\b/.exec(requestedRuntime || "")?.[1]
      : undefined;
  if (language === "python" && requestedRuntime && !pythonVersion)
    throw new UserError(
      "The managed remote verifier supports Python 3.12, 3.13 and 3.14.",
    );
  const checks: SandboxReport["checks"] = [];
  for (const [candidate, replacement] of candidates) {
    const sandbox = await Sandbox.create({
      image,
      networkPolicy: pythonVersion ? "allow-all" : "deny-all",
      resources: { vcpus: 1 },
      timeout: 90000,
      persistent: false,
      env: {},
    });
    try {
      await sandbox.mkDir("/vercel/sandbox");
      if (!sandbox.image?.includes("@sha256:"))
        throw new UserError(
          "The remote runtime did not return a reproducible image digest.",
        );
      image = sandbox.image;
      let executable = language === "python" ? "python3" : "node";
      if (pythonVersion) {
        const install = await sandbox.runCommand("uv", [
          "python",
          "install",
          pythonVersion,
        ]);
        if (install.exitCode !== 0)
          throw new UserError(
            "The isolated Python runtime could not be prepared; course files were not uploaded.",
          );
        const found = await sandbox.runCommand("uv", [
          "python",
          "find",
          pythonVersion,
        ]);
        executable = (await found.stdout()).trim();
        if (found.exitCode !== 0 || !/^\/[a-zA-Z0-9_./+-]+$/.test(executable))
          throw new UserError("The managed Python executable was unavailable.");
      }
      // Prepare only the trusted runtime with egress. Untrusted files are uploaded only after egress is denied.
      await sandbox.update({ networkPolicy: "deny-all" });
      const version = await sandbox.runCommand({
        cmd: executable,
        args: ["--version"],
        cwd: "/vercel/sandbox",
      });
      runtime = (await version.stdout()).trim();
      if (version.exitCode !== 0)
        throw new UserError(
          "The isolated runtime could not report its version.",
          503,
        );
      assertSandboxRuntime(language, requestedRuntime, runtime);
      if (pythonVersion)
        pythonVersion =
          /Python (3\.\d+\.\d+)/.exec(runtime)?.[1] || pythonVersion;
      await sandbox.writeFiles(
        files.map((entry) => ({
          path: `/vercel/sandbox/${entry.path}`,
          content: Buffer.from(
            replacement?.path === entry.path
              ? replacement.content
              : entry.content,
          ),
        })),
      );
      let output = "";
      const append = new Writable({
        write(chunk, _encoding, callback) {
          output = (output + chunk.toString()).slice(-20000);
          callback();
        },
      });
      const result = await sandbox.runCommand({
        cmd: "timeout",
        args: ["15s", executable, ...sandboxTestArgs(language, files)],
        cwd: "/vercel/sandbox",
        stdout: append,
        stderr: append,
        env: {},
      });
      const count =
        language === "python"
          ? /Ran (\d+) tests?/.exec(output)
          : /# tests (\d+)/.exec(output);
      checks.push({
        candidate,
        code: result.exitCode,
        tests: Number(count?.[1] || 0),
        output,
      });
    } finally {
      await sandbox.stop();
    }
  }
  return { image, runtime, checks };
}
