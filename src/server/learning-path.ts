import { practiceLanguage } from "../project-types.js";
import { z } from "zod";
import { createHash } from "node:crypto";
import { lstat } from "node:fs/promises";
import path from "node:path";
import { git } from "./git.js";
import type { Application } from "./application.js";
import type { Workspace } from "./workspace.js";
import type { Practice } from "./practice.js";
import type { ProjectRuntime } from "./project-runtime.js";
import type { LiveWork } from "./live-work.js";
import type { RunEvidence } from "../shared.js";
import { assertClean, UserError } from "./safety.js";

export const directionSchema = z.object({
  goal: z.string().trim().min(8).max(600),
  experience: z.enum(["new", "some", "experienced"]),
  minutes: z.number().int().min(10).max(240),
});
export type Direction = z.infer<typeof directionSchema> & { updatedAt: string };
export const milestones = [
  {
    id: "scope",
    title: "Define one useful outcome",
    brief:
      "Describe who needs your project, one useful behavior, an example input and output, and what you will leave for later.",
    evidence: "checkpoint",
    minutes: 15,
  },
  {
    id: "feature",
    title: "Build a small working slice",
    brief:
      "Implement your first useful behavior. Run it on your own example and explain how it works without referring to the tutorial.",
    evidence: "execution",
    minutes: 30,
  },
  {
    id: "checks",
    title: "Add repeatable behavior checks",
    brief:
      "Write tests for the expected behavior, empty input, and a failure case. Run them locally. Record the actual command and result.",
    evidence: "execution",
    minutes: 25,
  },
  {
    id: "robustness",
    title: "Change the requirement",
    brief:
      "Choose a new constraint your tutorial did not cover. Reproduce a failure, explain your hypothesis, implement your change, and rerun earlier checks.",
    evidence: "execution",
    minutes: 30,
  },
  {
    id: "delivery",
    title: "Make it usable by someone else",
    brief:
      "Write setup instructions and examples. For an interface, check keyboard navigation, labels, focus, and readable contrast; for a CLI, check input validation and error messages. Record what you checked and what remains.",
    evidence: "checkpoint",
    minutes: 25,
  },
  {
    id: "explain",
    title: "Explain the design and next step",
    brief:
      "Document one design tradeoff, a limitation, and an alternative. Explain your debugging process and what you would do with a different requirement.",
    evidence: "checkpoint",
    minutes: 15,
  },
] as const;
export type MilestoneRecord = {
  id: string;
  reference: string;
  reflection: string;
  at: string;
};
export type EvidenceItem = {
  id: string;
  kind: "checkpoint" | "run" | "check" | "command";
  label: string;
  at: string;
  passed: boolean;
  reference: string;
};

export class LearningPath {
  constructor(
    private app: Application,
    private workspace: Workspace,
    private practice: Practice,
    private runtime: ProjectRuntime,
    private live: LiveWork,
  ) {}
  course(id: string) {
    const course = this.app.configured().courses.find((c) => c.id === id);
    if (!course) throw new UserError("Choose an available course.", 404);
    return course;
  }
  direction(id: string) {
    return this.app.store.get<Direction>(`direction:${id}`);
  }
  async assertFresh(id: string, runId?: string) {
    const session = this.app.store.state().session;
    if (session?.courseId !== id) return undefined;
    if (this.workspace.isRunning(session.id))
      throw new UserError(
        "Wait for your local run to finish before asking for another hint.",
        409,
      );
    const versions = await this.workspace.versions(session.id);
    const signature = JSON.stringify(versions);
    const runs = (this.app.store.get<RunEvidence[]>(`runs:${id}`) || []).filter(
      (r) => r.workspace === session.workspace,
    );
    if (runId && !runs.some((r) => r.id === runId))
      throw new UserError(
        "That run does not belong to this course workspace.",
        404,
      );
    const attempts = this.practice
      .tasks()
      .filter((t) => t.courseId === id && t.workspace === session.workspace)
      .flatMap((t) => t.attempts.map((a) => ({ ...a, path: t.path })));
    const commands = this.runtime
      .records()
      .filter(
        (r) =>
          r.courseId === id &&
          r.workspace === session.workspace &&
          r.finishedAt,
      );
    const executions = [
      ...runs.map((r) => ({
        id: r.id,
        at: r.finishedAt,
        versions: r.workspaceVersions,
        path: r.path,
        fileVersion: r.fileVersion,
        stale: r.changedDuringRun,
      })),
      ...attempts.map((a) => ({
        id: a.id,
        at: a.at,
        versions: a.workspaceVersions,
        path: a.path,
        fileVersion: a.fileVersion,
        stale: a.stale,
      })),
      ...commands.map((c) => ({
        id: c.id,
        at: c.finishedAt!,
        versions: c.versions,
        path: "",
        fileVersion: "",
        stale: c.changedDuringRun || c.state !== "finished",
      })),
    ].sort((a, b) => b.at.localeCompare(a.at));
    const latest = executions[0];
    const baseline = this.app.store.get<{ signature: string; at: string }>(
      `help-baseline:${id}:${session.workspace}`,
    );
    if (
      latest &&
      ((latest.versions
        ? JSON.stringify(latest.versions) !== signature
        : latest.path && versions[latest.path] !== latest.fileVersion) ||
        latest.stale)
    ) {
      // New tasks may ask for an initial conceptual hint before a first check.
      const task = this.practice
        .tasks()
        .find(
          (t) =>
            t.courseId === id &&
            t.workspace === session.workspace &&
            t.status === "active" &&
            t.createdAt > latest.at &&
            !t.attempts.length,
        );
      if (!task || baseline)
        throw new UserError(
          "Test your changes first. Save and run the current code before requesting another hint.",
          409,
        );
    }
    if (
      baseline &&
      baseline.signature !== signature &&
      (!latest || latest.at <= baseline.at)
    )
      throw new UserError(
        "Test your changes first. Your code changed since the last hint; run it locally before asking again.",
        409,
      );
    if (runId && (!runs.some((r) => r.id === runId) || latest?.id !== runId))
      throw new UserError(
        "A newer result is available. Attach its result before asking about this error.",
        409,
      );
    return latest && runs.some((r) => r.id === latest.id)
      ? this.workspace.runContext(session.id, latest.id, versions)
      : undefined;
  }
  async rememberHelp(id: string) {
    const session = this.app.store.state().session;
    if (session?.courseId !== id) return;
    this.app.store.put(`help-baseline:${id}:${session.workspace}`, {
      signature: JSON.stringify(await this.workspace.versions(session.id)),
      at: new Date().toISOString(),
    });
  }
  async impact(id: string) {
    const course = this.course(id),
      session = this.app.store.state().session;
    if (session?.courseId !== id)
      throw new UserError("Open this course workspace to review its impact.");
    const versions = await this.workspace.versions(session.id);
    const runs = (this.app.store.get<RunEvidence[]>(`runs:${id}`) || []).filter(
      (r) => r.workspace === session.workspace,
    );
    const baseline = runs.find(
      (r) =>
        r.exitCode === 0 &&
        !r.timedOut &&
        !r.stopped &&
        !r.changedDuringRun &&
        r.workspaceVersions,
    );
    const changed = baseline
      ? Object.keys({ ...baseline.workspaceVersions, ...versions }).filter(
          (p) => baseline.workspaceVersions![p] !== versions[p],
        )
      : [];
    const dependencies: { file: string; references: string[] }[] = [];
    for (const file of Object.keys(versions).filter((p) =>
      /\.(?:[cm]?[jt]sx?|py|c|h|cpp|cc|cxx|hpp|hxx)$/.test(p),
    )) {
      const source = (await this.workspace.read(session.id, file)).content;
      const references = [
        ...source.matchAll(
          /(?:from\s+|import\s+|require\s*\(\s*|#\s*include\s*)["']?(\.?\/?[\w./-]+)/g,
        ),
      ].map((m) => m[1]);
      const matches = changed.filter((c) =>
        references.some((r) =>
          r.startsWith(".") || /\.(?:h|hpp|hxx)$/.test(r)
            ? path.posix
                .normalize(path.posix.join(path.posix.dirname(file), r))
                .replace(/\.[^.]+$/, "") === c.replace(/\.[^.]+$/, "")
            : r === path.posix.basename(c, path.posix.extname(c)),
        ),
      );
      if (matches.length) dependencies.push({ file, references: matches });
    }
    let diff =
      "No Git repository in the coding folder. Changed-file evidence uses recorded execution hashes.";
    if (
      (await lstat(path.join(session.workspace, ".git")).catch(() => null)) &&
      Object.keys(versions).length
    ) {
      const root = await git(session.workspace, [
        "rev-parse",
        "--show-toplevel",
      ]).catch(() => "");
      if (
        path.resolve(root).toLowerCase() ===
        path.resolve(session.workspace).toLowerCase()
      )
        diff =
          (
            await git(session.workspace, [
              "diff",
              "--no-ext-diff",
              "--no-textconv",
              "HEAD",
              "--stat",
              "--",
              ...Object.keys(versions),
            ]).catch(
              () =>
                "Git diff unavailable. Save an initial source commit to compare.",
            )
          ).slice(0, 8000) ||
          "No tracked diff against HEAD. New untracked files still appear in the recorded-run comparison.";
    }
    assertClean(diff, "impact summary");
    return {
      baselineId: baseline?.id,
      baselineLesson: course.lessons.find((l) => l.id === baseline?.lessonId)
        ?.title,
      changed,
      dependencies,
      diff,
      regressions: runs.filter((r) => r.regression).slice(0, 5),
      note: "Import references are a bounded static heuristic. A changed dependency suggests checks to rerun; only a recorded failure produces a Regression Alert. This is not causal proof or a complete dependency graph.",
    };
  }
  saveDirection(id: string, value: unknown) {
    this.course(id);
    const input = directionSchema.parse(value);
    assertClean(input.goal, "learning goal");
    const direction = { ...input, updatedAt: new Date().toISOString() };
    this.app.store.put(`direction:${id}`, direction);
    return this.status(id);
  }
  evidence(id: string): EvidenceItem[] {
    const state = this.app.store.state();
    return [
      ...state.checkpoints
        .filter((c) => c.courseId === id)
        .map((c) => ({
          id: c.id,
          kind: "checkpoint" as const,
          label: c.message.split("\n")[0],
          at: c.timestamp,
          passed: true,
          reference: c.sha,
        })),
      ...(this.app.store.get<RunEvidence[]>(`runs:${id}`) || []).map((r) => ({
        id: r.id,
        kind: "run" as const,
        label: `${r.path} · exit ${r.exitCode ?? "none"}`,
        at: r.finishedAt,
        passed:
          r.exitCode === 0 && !r.timedOut && !r.stopped && !r.changedDuringRun,
        reference: r.fileVersion,
      })),
      ...this.practice
        .tasks()
        .filter((t) => t.courseId === id)
        .flatMap((t) =>
          t.attempts.map((a) => ({
            id: a.id,
            kind: "check" as const,
            label: `${this.practice.exercise(t.exerciseId).title} · ${a.checks.filter((c) => c.passed).length}/${a.checks.length} checks`,
            at: a.at,
            passed: a.passed && !a.stale,
            reference: a.fileVersion,
          })),
        ),
      ...this.runtime
        .records()
        .filter((r) => r.courseId === id)
        .map((r) => ({
          id: r.id,
          kind: "command" as const,
          label: `${r.command} · exit ${r.exitCode ?? "none"}`,
          at: r.finishedAt || r.startedAt,
          passed:
            r.state === "finished" && r.exitCode === 0 && !r.changedDuringRun,
          reference: r.id,
        })),
    ].sort((a, b) => b.at.localeCompare(a.at));
  }
  status(id: string) {
    const course = this.course(id),
      direction = this.direction(id);
    const records =
      this.app.store.get<MilestoneRecord[]>(`milestones:${id}`) || [];
    const evidence = this.evidence(id);
    const current = course.lessons.find((l) => l.id === course.currentLessonId);
    const topic =
      `${current?.title || ""} ${current?.section || ""}`.toLowerCase();
    const runs = this.app.store.get<RunEvidence[]>(`runs:${id}`) || [];
    const language = practiceLanguage(course.title, runs[0]?.path);
    const tasks = this.practice.tasks().filter((t) => t.courseId === id);
    const candidates = this.practice
      .dashboard(id)
      .exercises.filter(
        (e) =>
          !e.transferFrom &&
          !e.retired &&
          e.language === language &&
          e.kind === "practice",
      );
    const recommended = candidates.find(
      (e) =>
        e.topics.some((t) => topic.includes(t)) &&
        !tasks.some((t) => t.exerciseId === e.id && t.status === "completed"),
    );
    return {
      courseId: id,
      direction,
      projectBound: course.workspaceMode === "project",
      milestones: milestones.map((m) => ({
        ...m,
        brief: `${direction ? `For “${direction.goal}”: ` : ""}${m.brief}`,
        sessions: Math.ceil(m.minutes / (direction?.minutes || 30)),
        record: records.find((r) => r.id === m.id),
      })),
      guidance:
        direction?.experience === "experienced"
          ? "Start from a constraint you have not handled before. Explain the design tradeoff and verify it with a counterexample."
          : direction?.experience === "some"
            ? "Build one behavior without replaying the lesson. Compare your expected result with the actual run."
            : "Start with one input and predict the output. Make one small change, run it, and explain what happened.",
      evidence: evidence.slice(0, 80),
      next: milestones.find((m) => !records.some((r) => r.id === m.id))?.id,
      recommendation: recommended
        ? {
            exerciseId: recommended.id,
            title: recommended.title,
            minutes: recommended.minutes,
            reason: `The current lesson mentions ${recommended.skill.toLowerCase()}. Try applying it toward “${direction?.goal || "your own project"}”.`,
            fitsSession: !direction || recommended.minutes <= direction.minutes,
          }
        : undefined,
      memory: tasks.map((t) => ({
        taskId: t.id,
        title: this.practice.exercise(t.exerciseId).title,
        transfer: !!t.transferOf,
        latest: t.attempts[0],
        reflection: t.reflection,
        help: t.hints,
      })),
      contributions: this.live
        .records()
        .filter((r) => r.courseId === id)
        .map((r) => ({ id: r.id, issue: r.candidate, stages: r.stages })),
    };
  }
  complete(
    id: string,
    milestoneId: string,
    reference: string,
    reflection: string,
  ) {
    const milestone = milestones.find((m) => m.id === milestoneId);
    if (!milestone) throw new UserError("Choose an available milestone.");
    this.course(id);
    assertClean(reflection, "milestone reflection");
    if (reflection.trim().length < 20 || reflection.length > 4000)
      throw new UserError(
        "Explain what you did, what you checked, and what is still uncertain (at least 20 characters).",
      );
    const evidence = this.evidence(id).find((e) => e.id === reference);
    if (
      !evidence ||
      !evidence.passed ||
      (milestone.evidence === "checkpoint"
        ? evidence.kind !== "checkpoint"
        : evidence.kind === "checkpoint")
    )
      throw new UserError(
        "Attach a relevant saved checkpoint or successful recorded execution from this course.",
      );
    const records =
      this.app.store.get<MilestoneRecord[]>(`milestones:${id}`) || [];
    this.app.store.put(`milestones:${id}`, [
      ...records.filter((r) => r.id !== milestoneId),
      { id: milestoneId, reference, reflection, at: new Date().toISOString() },
    ]);
    return this.status(id);
  }
  async writeBrief(id: string) {
    const course = this.course(id),
      direction = this.direction(id),
      session = this.app.store.state().session;
    if (!direction) throw new UserError("Save your learning direction first.");
    if (session?.courseId !== id || session.contributionId)
      throw new UserError("Open this course's coding workspace first.");
    const file = "OUTCLASS-PROJECT.md";
    // Never overwrite a learner's existing brief.
    await this.workspace.save(
      session.id,
      file,
      `# ${direction.goal}\n\nCourse: ${course.title}\nExperience: ${direction.experience}\nSession budget: ${direction.minutes} minutes\n\n${milestones.map((m) => `## ${m.title}\n${m.brief}\n\n### My decisions and evidence\n`).join("\n")}\nOutClass supplied this brief. You implement and validate the project. Milestones record your explanation and references; they do not certify proficiency.\n`,
      null,
    );
    return { path: file };
  }
  async ledger(id: string, format: "markdown" | "html") {
    const status = this.status(id),
      course = this.course(id),
      state = this.app.store.state();
    const checkpoints = state.checkpoints.filter((c) => c.courseId === id);
    const session = state.session?.courseId === id ? state.session : undefined;
    const structure =
      session && !session.contributionId
        ? (await this.workspace.list(session.id, false)).files.map(
            (f) => f.path,
          )
        : [...new Set(checkpoints.flatMap((c) => c.files))];
    const blocks: { title: string; text: string }[] = [
      {
        title: "Learning direction",
        text: status.direction
          ? `${status.direction.goal}\nExperience: ${status.direction.experience}\nSession budget: ${status.direction.minutes} minutes`
          : "No direction recorded.",
      },
      {
        title: "Project structure",
        text: structure.slice(0, 400).join("\n") || "No source files recorded.",
      },
      ...status.milestones
        .filter((m) => m.record)
        .map((m) => ({
          title: m.title,
          text: `${m.record!.reflection}\nEvidence: ${m.record!.reference}\nRecorded: ${m.record!.at}\nLearner-reported milestone, with attached local evidence.`,
        })),
      ...checkpoints.map((c) => ({
        title: `Checkpoint · ${c.lessonTitle}`,
        text: `${c.reflection || "No reflection stored for this older checkpoint."}\nCommit: ${c.sha}\nRecorded: ${c.timestamp}\nFiles: ${c.files.join(", ")}`,
      })),
      ...this.practice
        .tasks()
        .filter((t) => t.courseId === id)
        .flatMap((t) =>
          t.attempts.map((a) => ({
            title: `${t.transferOf ? "Changed requirement" : "Practice"} · ${this.practice.exercise(t.exerciseId).title}`,
            text: `${a.passed && !a.stale ? "Recorded behavior checks passed" : "Attempt needs more work"}\n${a.checks.map((c) => `${c.passed ? "PASS" : "FAIL"} ${c.label}`).join("\n")}\nAttempt: ${a.id}\nSource SHA-256: ${a.fileVersion}\nRecorded: ${a.at}\nHelp requests recorded: ${a.hints}\nSource excerpt ${a.sourceTruncated ? "(truncated)" : ""}:\n${a.source}\nLearner reflection:\n${t.reflection || "Not recorded"}`,
          })),
        ),
      ...status.contributions.map((c) => ({
        title: "Contribution preparation",
        text: `${c.issue.url}\nLearner-reported stages: ${c.stages.join(", ")}\nThis record does not claim an accepted contribution.`,
      })),
    ];
    const disclosure =
      "A local learning record, not a certification of mastery or authorship. Hashes and Git commits reference recorded work; local records can be edited. OutClass help is disclosed; outside assistance is not measured. Check results cover only the named behaviors at the recorded time. Review this export before sharing.";
    const content = JSON.stringify({ course: course.title, blocks });
    assertClean(content, "learning ledger");
    if (this.app.apiKey && content.includes(this.app.apiKey))
      throw new UserError(
        "Remove sensitive content before exporting your ledger.",
      );
    const digest = createHash("sha256").update(content).digest("hex");
    const escape = (s: string) =>
      s.replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c]!,
      );
    const markdownTitle = (s: string) =>
      s
        .replace(/[\r\n]/g, " ")
        .replace(/[\\`*_{}\[\]()<>#!|&]/g, (c) => `\\${c}`);
    const document =
      format === "markdown"
        ? `# OutClass Learning Ledger\n\n${markdownTitle(course.title)}\n\n${disclosure}\n\n${blocks
            .map(
              (b) =>
                `## ${markdownTitle(b.title)}\n\n${b.text
                  .split("\n")
                  .map((line) => `    ${line}`)
                  .join("\n")}\n`,
            )
            .join("\n")}\nRecord digest: ${digest}\n`
        : `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OutClass Learning Ledger</title><style>body{margin:0;background:#f2f4f8;color:#162238;font:15px/1.7 system-ui}main{max-width:880px;margin:60px auto;padding:40px;background:white;border-top:5px solid #426de8}h1{font-size:42px;letter-spacing:-2px}h2{font-size:20px;margin-top:38px;color:#3153a1}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.8 ui-monospace,monospace}footer,aside{color:#576579;font-size:12px}section{border-bottom:1px solid #e2e7ef;padding-bottom:22px}@media print{body,main{background:white;margin:0}main{padding:20px}section{break-inside:avoid}}@media(max-width:600px){main{margin:0;padding:24px}h1{font-size:32px}}</style><main><header><p>OUTCLASS / LEARNING LEDGER</p><h1>${escape(course.title)}</h1></header><aside>${escape(disclosure)}</aside>${blocks.map((b) => `<section><h2>${escape(b.title)}</h2><pre>${escape(b.text)}</pre></section>`).join("")}<footer>Record digest: ${digest}</footer></main></html>`;
    return { content: document, format, digest };
  }
}
