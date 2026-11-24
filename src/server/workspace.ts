import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  writeFile,
  access,
  mkdtemp,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { nativeCompiler, nativeArguments } from "./native-runtime.js";
import { constants } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import ignore from "ignore";
import type { Application } from "./application.js";
import { assertClean, child, excluded, inside, UserError } from "./safety.js";
import type {
  Diagnostics,
  ResumeAnchor,
  RunContext,
  RunEvidence,
} from "../shared.js";
import * as git from "./git.js";

const hash = (value: Buffer | string) =>
  createHash("sha256").update(value).digest("hex");
export class Workspace {
  private jobs = new Map<string, ChildProcess>();
  private stopped = new Set<string>();
  private previews = new Map<string, { html: string; expires: number }>();
  private liveRuns = new Map<
    string,
    { path: string; output: string; inputs: number }
  >();
  constructor(private app: Application) {}
  isRunning(id: string) {
    return this.jobs.has(id);
  }
  track(id: string, job: ChildProcess) {
    if (this.jobs.has(id)) {
      job.kill();
      throw new UserError("A program is already running.", 409);
    }
    this.stopped.delete(id);
    this.jobs.set(id, job);
  }
  untrack(id: string, job: ChildProcess) {
    if (this.jobs.get(id) === job) this.jobs.delete(id);
    this.stopped.delete(id);
  }
  session(id: string) {
    const session = this.app.configured().session;
    if (!session || session.id !== id)
      throw new UserError(
        "This lesson session has changed. Reopen the coding workspace.",
        409,
      );
    return session;
  }
  async location(id: string, relative: string, creating = false) {
    const session = this.session(id);
    if (
      excluded(relative) ||
      relative.length > 300 ||
      relative
        .split("/")
        .some(
          (part) =>
            /[<>:"|?*\x00-\x1f]/.test(part) ||
            /[. ]$/.test(part) ||
            /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
        )
    )
      throw new UserError(
        "Use a regular source file inside the lesson folder. Secret and system files are excluded.",
      );
    const target = child(session.workspace, relative);
    let parent = session.workspace;
    for (const part of relative.split("/")) {
      parent = path.join(parent, part);
      const info = await lstat(parent).catch(() => null);
      if (!info) {
        if (creating) continue;
        throw new UserError("That file no longer exists.", 404);
      }
      if (
        info.isSymbolicLink() ||
        !inside(session.workspace, await realpath(parent))
      )
        throw new UserError(
          "Linked files outside the coding folder cannot be opened.",
        );
    }
    const root = await realpath(session.workspace);
    if (root.toLowerCase() !== session.workspace.toLowerCase())
      throw new UserError(
        "The coding folder changed. Select its real location again.",
      );
    return { session, target };
  }
  async list(id: string, evidence = true) {
    const session = this.session(id);
    const rules = ignore();
    for (const name of [".gitignore", ".gitlearnignore"])
      rules.add(
        await readFile(path.join(session.workspace, name), "utf8").catch(
          () => "",
        ),
      );
    const files: { path: string; size: number; version: string }[] = [];
    const folders: string[] = [];
    let skipped = 0;
    const walk = async (relative: string, depth: number) => {
      if (depth > 12) return;
      for (const entry of await readdir(
        path.join(session.workspace, relative),
        { withFileTypes: true },
      )) {
        if (files.length >= 400 || folders.length >= 400) {
          skipped++;
          continue;
        }
        const name = relative ? `${relative}/${entry.name}` : entry.name;
        if (
          excluded(name) ||
          rules.ignores(name + (entry.isDirectory() ? "/" : ""))
        ) {
          skipped++;
          continue;
        }
        try {
          const { target } = await this.location(id, name);
          const info = await lstat(target);
          if (info.isDirectory()) {
            folders.push(name);
            await walk(name, depth + 1);
          } else if (info.isFile() && info.size <= 512000) {
            const bytes = await readFile(target);
            if (!bytes.includes(0))
              files.push({ path: name, size: info.size, version: hash(bytes) });
            else skipped++;
          } else skipped++;
        } catch {
          skipped++;
        }
      }
    };
    await walk("", 0);
    files.sort((a, b) => a.path.localeCompare(b.path));
    const versions = Object.fromEntries(files.map((f) => [f.path, f.version]));
    return {
      sessionId: id,
      workspace: session.workspace,
      files,
      folders: folders.sort((a, b) => a.localeCompare(b)),
      skipped,
      anchor: this.app.store.get<ResumeAnchor>(`resume:${session.courseId}`),
      lastRun: evidence ? (await this.runs(id, versions))[0] : undefined,
    };
  }
  async versions(id: string): Promise<Record<string, string>> {
    const listing = await this.list(id, false);
    return Object.fromEntries(
      listing.files.map((file) => [file.path, file.version]),
    );
  }
  runStatus(id: string) {
    this.session(id);
    const live = this.liveRuns.get(id);
    let output = live?.output || "";
    try {
      assertClean(output, "live output");
      if (this.app.apiKey && output.includes(this.app.apiKey)) throw Error();
    } catch {
      output = "[Sensitive output excluded]";
    }
    return {
      running: !!live,
      path: live?.path,
      output: output.slice(-16000),
      acceptsInput: !!live && !this.jobs.get(id)?.stdin?.destroyed,
    };
  }
  input(id: string, text: string) {
    this.session(id);
    const live = this.liveRuns.get(id),
      job = this.jobs.get(id);
    if (!live || !job?.stdin || job.stdin.destroyed)
      throw new UserError("This run is no longer accepting input.", 409);
    if (text.length > 4000 || /[\r\n\x00]/.test(text) || live.inputs >= 100)
      throw new UserError(
        "Send one short line at a time (up to 100 lines per run).",
      );
    live.inputs++;
    job.stdin.write(text + "\n");
  }
  async editorAnchor(id: string, relative: string, cursor: number) {
    const session = this.session(id);
    const file = await this.read(id, relative);
    this.app.remember(session, "saved");
    const anchor = this.app.store.get<ResumeAnchor>(
      `resume:${session.courseId}`,
    )!;
    anchor.file = relative;
    anchor.cursor = Math.min(cursor, file.content.length);
    this.app.store.put(`resume:${session.courseId}`, anchor);
    return anchor;
  }
  async runContext(
    id: string,
    runId: string,
    currentVersions?: Record<string, string>,
  ): Promise<RunContext> {
    const session = this.session(id);
    const runs =
      this.app.store.get<RunEvidence[]>(`runs:${session.courseId}`) || [];
    const record = runs.find(
      (run) => run.id === runId && run.workspace === session.workspace,
    );
    if (!record)
      throw new UserError(
        "That run does not belong to this course workspace.",
        404,
      );
    const versions = currentVersions || (await this.versions(id));
    return {
      ...record,
      stale:
        record.changedDuringRun ||
        versions[record.path] !== record.fileVersion ||
        (!!record.workspaceVersions &&
          JSON.stringify(versions) !==
            JSON.stringify(record.workspaceVersions)),
    };
  }
  async runs(
    id: string,
    currentVersions?: Record<string, string>,
  ): Promise<RunContext[]> {
    const session = this.session(id);
    const records =
      this.app.store.get<RunEvidence[]>(`runs:${session.courseId}`) || [];
    const versions = currentVersions || (await this.versions(id));
    return Promise.all(
      records
        .filter((run) => run.workspace === session.workspace)
        .slice(0, 10)
        .map((run) => this.runContext(id, run.id, versions)),
    );
  }
  async pythonRuntime(workspace?: string, relative?: string) {
    const roots: string[] = [];
    if (workspace) {
      let directory = relative
        ? path.dirname(child(workspace, relative))
        : workspace;
      while (inside(workspace, directory)) {
        roots.push(directory);
        if (directory === workspace) break;
        directory = path.dirname(directory);
      }
    }
    for (const root of roots)
      for (const folder of [".venv", "venv"]) {
        const candidate = path.join(
          root,
          folder,
          process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
        );
        if (
          (await stat(candidate).catch(() => null))?.isFile() &&
          inside(root, await realpath(path.dirname(candidate)))
        )
          return candidate;
      }
    return "python";
  }
  async diagnostics(): Promise<Diagnostics> {
    const state = this.app.store.state();
    const writable = (root: string) =>
      access(root, constants.W_OK).then(
        () => true,
        () => false,
      );
    const pythonRuntime = await this.pythonRuntime(state.session?.workspace);
    const [pythonAvailable, gitAvailable, historyWritable, workspaceWritable] =
      await Promise.all([
        git.available(pythonRuntime),
        git.available("git"),
        state.settings.configured
          ? writable(state.settings.repoPath)
          : Promise.resolve(false),
        state.session
          ? writable(state.session.workspace)
          : Promise.resolve(null),
      ]);
    return {
      nodeVersion: process.versions.node,
      webToolchainAvailable: await git.available("node"),
      pythonAvailable,
      pythonRuntime,
      cCompiler: await nativeCompiler(false),
      cppCompiler: await nativeCompiler(true),
      npmAvailable: (
        await Promise.all(
          (process.env.PATH || process.env.Path || "")
            .split(path.delimiter)
            .map((directory) =>
              stat(
                path.join(
                  directory,
                  process.platform === "win32" ? "npm.cmd" : "npm",
                ),
              ).then(
                (info) => info.isFile(),
                () => false,
              ),
            ),
        )
      ).some(Boolean),
      gitAvailable,
      historyWritable,
      workspaceWritable,
      hasApiKey: !!this.app.apiKey,
      hasAI: this.app.ai.ready(),
      assistantEnabled: !!state.settings.assistantEnabled,
      extensionConnected: !!this.app.store.get("extensionToken"),
    };
  }
  async read(id: string, relative: string) {
    const { target } = await this.location(id, relative);
    const info = await lstat(target);
    if (!info.isFile() || info.size > 512000)
      throw new UserError("The editor supports text files up to 512 KB.");
    const bytes = await readFile(target);
    if (bytes.includes(0))
      throw new UserError("Open this binary file in its own application.");
    return {
      path: relative,
      content: bytes.toString("utf8"),
      version: hash(bytes),
    };
  }
  async save(
    id: string,
    relative: string,
    content: string,
    version: string | null,
  ) {
    if (Buffer.byteLength(content) > 512000)
      throw new UserError("The editor supports files up to 512 KB.");
    const { target } = await this.location(id, relative, version === null);
    const previous = await readFile(target).catch(() => null);
    if (version === null && previous !== null)
      throw new UserError("That file already exists. Open it from Files.", 409);
    if (version !== null && (!previous || hash(previous) !== version))
      throw new UserError(
        "This file changed on disk. Reload it before saving so those edits are preserved.",
        409,
      );
    if (version === null)
      await mkdir(path.dirname(target), { recursive: true });
    await this.location(id, relative, true);
    await writeFile(target, content, { flag: version === null ? "wx" : "w" });
    return { path: relative, content, version: hash(content) };
  }
  async createFolder(id: string, relative: string) {
    const { target } = await this.location(id, relative, true);
    await mkdir(target, { recursive: true });
  }
  async cloneRepository(id: string, address: string, folder: string) {
    const match = /^https:\/\/github\.com\/([\w-]+)\/([\w.-]+?)\/?$/i.exec(
      address.trim(),
    );
    if (!match)
      throw new UserError(
        "Use a GitHub HTTPS link such as https://github.com/owner/repository.",
      );
    const repository = match[2].replace(/\.git$/i, "");
    const relative = folder ? `${folder}/${repository}` : repository;
    const { target } = await this.location(id, relative, true);
    if (await lstat(target).catch(() => null))
      throw new UserError(
        "A file or folder with that repository name already exists.",
        409,
      );
    const parent = path.dirname(target);
    if (folder) await this.location(id, folder);
    const noConfig = process.platform === "win32" ? "NUL" : "/dev/null";
    await git.run(
      "git",
      [
        "-c",
        "credential.helper=",
        "-c",
        "core.symlinks=false",
        "-c",
        "http.followRedirects=false",
        "clone",
        "--depth=1",
        "--template=",
        "--",
        `https://github.com/${match[1]}/${repository}.git`,
        target,
      ],
      parent,
      undefined,
      {
        GIT_CONFIG_GLOBAL: noConfig,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_ALLOW_PROTOCOL: "https",
        GIT_CONFIG_COUNT: "0",
      },
    );
  }
  stop(id: string) {
    const process = this.jobs.get(id);
    if (process && process.exitCode === null && process.pid) {
      this.stopped.add(id);
      if (globalThis.process.platform === "win32")
        spawn("taskkill.exe", ["/PID", String(process.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        });
      else {
        try {
          globalThis.process.kill(-process.pid, "SIGKILL");
        } catch {
          process.kill("SIGKILL");
        }
      }
    }
  }
  async stopAll() {
    for (const id of this.jobs.keys()) this.stop(id);
    for (let i = 0; this.jobs.size && i < 80; i++)
      await new Promise((resolve) => setTimeout(resolve, 25));
  }
  async preview(id: string, relative: string) {
    if (!/\.html?$/i.test(relative))
      throw new UserError(
        "Preview supports a single HTML file with inline CSS and JavaScript.",
      );
    const file = await this.read(id, relative);
    for (const [key, value] of this.previews)
      if (value.expires < Date.now()) this.previews.delete(key);
    if (this.previews.size >= 10)
      this.previews.delete(this.previews.keys().next().value!);
    const token = randomUUID();
    this.previews.set(token, {
      html: file.content,
      expires: Date.now() + 600000,
    });
    return { url: `/preview/${token}` };
  }
  previewDocument(token: string) {
    const doc = this.previews.get(token);
    if (!doc || doc.expires < Date.now())
      throw new UserError("This preview expired. Choose Preview again.", 404);
    return doc.html;
  }
  async run(id: string, relative: string) {
    const { session, target } = await this.location(id, relative);
    const file = await this.read(id, relative);
    const workspaceVersions = await this.versions(id);
    if (this.jobs.has(id))
      throw new UserError(
        "A program is already running. Stop it before starting another.",
        409,
      );
    const extension = path.extname(relative).toLowerCase();
    if (
      ![
        ".js",
        ".mjs",
        ".cjs",
        ".ts",
        ".mts",
        ".cts",
        ".py",
        ".c",
        ".cpp",
        ".cc",
        ".cxx",
      ].includes(extension)
    )
      throw new UserError(
        "Run supports JavaScript, erasable TypeScript, Python, C and C++. React/Next.js JSX and TSX need their project's dev server in Project console. Use Preview for HTML.",
      );
    const runtime =
      extension === ".py"
        ? await this.pythonRuntime(session.workspace, relative)
        : process.execPath;
    const native = [".c", ".cpp", ".cc", ".cxx"].includes(extension);
    const compiler = native
      ? await nativeCompiler(extension !== ".c")
      : undefined;
    // Validate the compiler before allocating a temporary build directory.
    if (native) nativeArguments(compiler, target, "", extension !== ".c");
    const startedAt = new Date().toISOString();
    this.session(id);
    // Runtime lookup awaits disk access; recheck before spawning to prevent two overlapping runs.
    if (this.jobs.has(id))
      throw new UserError(
        "A program is already running. Stop it before starting another.",
        409,
      );
    this.stopped.delete(id);
    const env: NodeJS.ProcessEnv = {};
    for (const key of [
      "PATH",
      "Path",
      "SYSTEMROOT",
      "SystemRoot",
      "WINDIR",
      "TEMP",
      "TMP",
      "USERPROFILE",
      "HOME",
    ])
      if (process.env[key]) env[key] = process.env[key];
    env.PYTHONIOENCODING = "utf-8";
    if (extension !== ".py" && process.versions.electron)
      env.ELECTRON_RUN_AS_NODE = "1";
    const buildDirectory = native
      ? await mkdtemp(path.join(tmpdir(), "outclass-native-"))
      : undefined;
    // mkdtemp yields; preserve the one-program-per-workspace invariant.
    if (this.jobs.has(id)) {
      if (buildDirectory)
        await rm(buildDirectory, { recursive: true, force: true });
      throw new UserError("A program is already running. Stop it first.", 409);
    }
    const args = native
      ? nativeArguments(
          compiler,
          target,
          path.join(
            buildDirectory!,
            process.platform === "win32" ? "program.exe" : "program",
          ),
          extension !== ".c",
        )
      : extension === ".py"
        ? ["-u", target]
        : [target];
    return new Promise<{
      output: string;
      exitCode: number | null;
      timedOut: boolean;
      run: RunContext;
    }>((resolve, reject) => {
      const job = spawn(runtime, args, {
        cwd: session.workspace,
        env,
        windowsHide: true,
        shell: false,
        detached: process.platform !== "win32",
        stdio: ["pipe", "pipe", "pipe"],
      });
      this.jobs.set(id, job);
      const live = { path: relative, output: "", inputs: 0 };
      this.liveRuns.set(id, live);
      job.stdin?.on("error", () => {});
      let output = "",
        timedOut = false,
        limited = false,
        failed = false;
      const append = (chunk: Buffer) => {
        if (limited) return;
        output += chunk.toString();
        live.output = output;
        if (output.length > 64000) {
          limited = true;
          output = output.slice(0, 64000) + "\n[Output limit reached]";
          this.stop(id);
        }
      };
      job.stdout?.on("data", append);
      job.stderr?.on("data", append);
      const timer = setTimeout(() => {
        timedOut = true;
        this.stop(id);
      }, 10000);
      job.on("error", () => {
        failed = true;
        clearTimeout(timer);
        this.jobs.delete(id);
        this.liveRuns.delete(id);
        reject(
          new UserError(
            extension === ".py"
              ? "Python was not found. Install Python and restart OutClass, or run a JavaScript file."
              : "The local runtime could not start.",
            503,
          ),
        );
      });
      job.on("close", async (code) => {
        clearTimeout(timer);
        this.jobs.delete(id);
        this.liveRuns.delete(id);
        if (buildDirectory)
          await rm(buildDirectory, { recursive: true, force: true }).catch(
            () => {},
          );
        if (failed) return;
        const completeOutput =
          output + (timedOut ? "\n[Stopped after 10 seconds]" : "");
        const safeText = (value: string, name: string, limit: number) => {
          try {
            assertClean(value, name);
            if (this.app.apiKey && value.includes(this.app.apiKey))
              throw new Error("Credential");
            return value.slice(0, limit);
          } catch {
            return "[Sensitive content excluded from run history and AI context]";
          }
        };
        try {
          const current = await readFile(target).catch(() => null);
          const record: RunEvidence = {
            id: randomUUID(),
            sessionId: id,
            courseId: session.courseId,
            lessonId: session.lessonId,
            workspace: session.workspace,
            path: relative,
            fileVersion: file.version,
            source: safeText(file.content, "run source", 16000),
            sourceTruncated: file.content.length > 16000,
            output: safeText(completeOutput, "run output", 16000),
            outputTruncated: completeOutput.length > 16000 || limited,
            exitCode: code,
            timedOut,
            stopped: this.stopped.delete(id),
            startedAt,
            finishedAt: new Date().toISOString(),
            changedDuringRun:
              !current ||
              hash(current) !== file.version ||
              JSON.stringify(await this.versions(id)) !==
                JSON.stringify(workspaceVersions),
            workspaceVersions,
          };
          const records =
            this.app.store.get<RunEvidence[]>(`runs:${session.courseId}`) || [];
          const baseline = records.find(
            (r) =>
              r.workspace === session.workspace &&
              r.path === relative &&
              r.exitCode === 0 &&
              !r.stopped &&
              !r.timedOut &&
              !r.changedDuringRun &&
              r.lessonId !== session.lessonId,
          );
          if (
            baseline &&
            code !== null &&
            code !== 0 &&
            !timedOut &&
            !record.stopped &&
            !record.changedDuringRun
          )
            record.regression = {
              baselineId: baseline.id,
              lessonId: baseline.lessonId,
              changedFiles: Object.keys({
                ...baseline.workspaceVersions,
                ...workspaceVersions,
              })
                .filter(
                  (p) =>
                    baseline.workspaceVersions?.[p] !== workspaceVersions[p],
                )
                .slice(0, 40),
            };
          this.app.store.put(
            `runs:${session.courseId}`,
            [record, ...records].slice(0, 20),
          );
          if (this.app.store.state().session?.id === id)
            this.app.remember(this.session(id), "saved");
          resolve({
            output: completeOutput,
            exitCode: code,
            timedOut,
            run: { ...record, stale: record.changedDuringRun },
          });
        } catch {
          reject(
            new UserError(
              "The program finished, but its run history could not be saved. Run again when the workspace is available.",
              503,
            ),
          );
        }
      });
    });
  }
}
