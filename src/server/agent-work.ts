import { createHash, randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import {
  agentWorkAnswer,
  agentWorkInstructions,
  agentWorkRequest,
  type AgentWorkAnswer,
  type AgentWorkRequest,
} from "../agent-work-contract.js";
import { learnPackageIssues } from "../learn-package-contract.js";
import { promotionPost } from "../promotion-contract.js";
import type { Application } from "./application.js";
import type { Expansion } from "./expansion.js";
import { ProductAgents } from "./product-agents.js";
import type { CreatorProduction } from "./creator-production.js";
import { GTMStudio } from "./gtm-studio.js";
import { assertClean, UserError } from "./safety.js";
import { MediaTranscripts } from "./media-transcripts.js";
import {
  AgentHandoffs,
  agentDomain,
  type AgentDomain,
} from "./agent-handoffs.js";
import type { ProductAgentRun } from "./product-agents.js";

const key = "suite:work:v1";
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Phase =
  | "queued"
  | "drafting"
  | "checking"
  | "repairing"
  | "ready"
  | "applying"
  | "applied"
  | "failed"
  | "canceled"
  | "interrupted";
const inFlight = new Set<Phase>([
  "queued",
  "drafting",
  "checking",
  "repairing",
  "applying",
]);
export type AgentWork = {
  id: string;
  request: AgentWorkRequest;
  phase: Phase;
  createdAt: string;
  finishedAt?: string;
  calls: number;
  sourceHash: string;
  sources: { id: string; title: string; text: string }[];
  events: { at: string; message: string }[];
  answer?: AgentWorkAnswer;
  reviewHash?: string;
  error?: string;
  validation: string[];
  promotionId?: string;
  handoffRunId?: string;
  handoffRevision?: number;
  delivery?: { kind: string; id: string; revision?: number; label: string }[];
};

/** Durable, bounded draft production. External publishing remains a separate reviewed workflow. */
export class AgentWorkService {
  private active = new Map<string, Promise<void>>();
  private stopped = false;
  readonly proposals: ProductAgents;
  constructor(
    private app: Application,
    private expansion: Expansion,
    private media: CreatorProduction,
  ) {
    this.proposals = new ProductAgents(app, () => expansion.state());
    for (const row of this.list())
      if (inFlight.has(row.phase)) {
        row.phase = "interrupted";
        row.error =
          "OutClass restarted during this task. Review saved progress and retry explicitly.";
        row.finishedAt = new Date().toISOString();
        this.save(row, "Interrupted by restart; no automatic model retry.");
      }
  }
  list() {
    return this.app.store.get<AgentWork[]>(key) || [];
  }
  get(id: string) {
    const row = this.list().find((r) => r.id === id);
    if (!row) throw new UserError("Agent task not found.", 404);
    return row;
  }
  private save(row: AgentWork, message?: string) {
    if (message) row.events.push({ at: new Date().toISOString(), message });
    row.events = row.events.slice(-20);
    const rows = this.list();
    const others = rows.filter((r) => r.id !== row.id),
      pending = others.filter((r) => inFlight.has(r.phase));
    this.app.store.put(key, [
      ...others
        .filter((r) => !inFlight.has(r.phase))
        .slice(-(79 - pending.length)),
      ...pending,
      row,
    ]);
  }
  context(
    input: Pick<
      AgentWorkRequest,
      "domain" | "entityId" | "lessonIndex" | "assetId"
    > & { goal?: string },
  ) {
    const base = this.proposals.context(input.domain, input.entityId),
      state = this.expansion.state();
    const entity = base.entity;
    const creative =
      input.domain === "creative"
        ? state.creatives.find((c) => c.id === input.entityId)
        : state.campaigns.find((c) => c.id === input.entityId)
            ?.creativeSnapshot;
    const release = creative
      ? state.releases.find((r) => r.id === creative.releaseId)
      : undefined;
    const course =
      input.domain === "academy"
        ? state.courses.find((c) => c.id === input.entityId)
        : release;
    if (!course || !course.lessons[input.lessonIndex])
      throw new UserError("Choose an available source lesson.");
    if (creative && creative.lessonIndex !== input.lessonIndex)
      throw new UserError("Use the lesson pinned to this draft.", 409);
    if (!course.rightsConfirmed)
      throw new UserError(
        "Confirm rights to the source course before running its agent.",
      );
    const lesson = course.lessons[input.lessonIndex];
    const asset = input.assetId
      ? this.media.state().assets.find((a) => a.id === input.assetId)
      : undefined;
    if (input.assetId && (!asset || input.domain !== "creative"))
      throw new UserError(
        "Choose owned source footage for the Creative Director.",
      );
    const sources = base.sources.filter((s) => !s.id.startsWith("lesson:"));
    sources.push({
      id: `lesson:${input.lessonIndex}`,
      title: lesson.title,
      text: JSON.stringify({
        objective: lesson.objective,
        practice: lesson.practice,
        content: lesson.content,
        currentAssignment: lesson.learn
          ? {
              ...lesson.learn,
              starterFiles: lesson.learn.starterFiles.map((f) => ({
                path: f.path,
              })),
            }
          : null,
      }),
    });
    const brief =
      input.domain === "academy"
        ? {
            title: course.title,
            audience: course.audience,
            outcome: course.outcome,
          }
        : input.domain === "creative"
          ? {
              title: creative!.title,
              brief: creative!.brief,
              copy: creative!.copy,
            }
          : (() => {
              const c = state.campaigns.find((c) => c.id === input.entityId)!;
              return {
                title: c.title,
                goal: c.goal,
                destination: c.destination,
                currency: c.currency,
              };
            })();
    sources.push({
      id: `brief:${entity.id}`,
      title: "Saved task brief",
      text: JSON.stringify(brief),
    });
    if (asset)
      sources.push(
        ...new MediaTranscripts(this.app, this.media).sources(
          asset.id,
          `${input.goal || ""} ${lesson.title} ${lesson.objective}`,
        ),
      );
    if (asset)
      sources.push({
        id: `asset:${asset.id}`,
        title: asset.name,
        text: JSON.stringify(asset),
      });
    const context = {
      domain: input.domain,
      selectedLesson: input.lessonIndex,
      allowedPrerequisiteLessons: Array.from(
        { length: input.lessonIndex },
        (_, index) => index,
      ),
      measurementEvidence: {
        status: sources.some((s) => /^(report|trend|observation):/.test(s.id))
          ? "available"
          : "not_recorded",
        sourceIds: sources
          .filter((s) => /^(report|trend|observation):/.test(s.id))
          .map((s) => s.id),
      },
      brief,
      curriculum: course.lessons.map((l, index) => ({
        index,
        title: l.title,
        objective: l.objective.slice(0, 200),
      })),
      sources,
      asset: asset || null,
    };
    if (JSON.stringify(context).length > 78000)
      throw new UserError(
        "This context is large. Narrow the brief or accepted handoffs before running.",
      );
    const timeline =
      input.domain === "creative"
        ? this.media.state().drafts.find((d) => d.creativeId === input.entityId)
        : undefined;
    return {
      context,
      sources,
      entity,
      course,
      creative,
      release,
      asset,
      hash: digest({ entity, context, timeline }),
    };
  }
  start(raw: unknown) {
    const input = agentWorkRequest.parse(raw);
    assertClean(JSON.stringify(input), "agent task");
    const previous = this.list().find(
      (r) => r.request.requestId === input.requestId,
    );
    if (previous) {
      if (digest(previous.request) !== digest(input))
        throw new UserError("Use a new request ID for a different task.", 409);
      return previous;
    }
    if (this.stopped) throw new UserError("OutClass is shutting down.", 503);
    if (
      this.active.size >= 2 ||
      this.list().some(
        (r) => r.request.entityId === input.entityId && inFlight.has(r.phase),
      )
    )
      throw new UserError(
        "Wait for the current task on this draft to finish.",
        409,
      );
    if (!this.app.ai.ready())
      throw new UserError("Connect AI in Settings before starting this task.");
    if (
      input.domain === "growth" &&
      (!input.providers.length ||
        new Set(input.providers).size !== input.providers.length)
    )
      throw new UserError("Choose each requested social channel once.");
    const source = this.context(input);
    if (source.entity.revision !== input.expectedRevision)
      throw new UserError("Reload the saved draft before starting.", 409);
    const row: AgentWork = {
      id: randomUUID(),
      request: input,
      phase: "queued",
      createdAt: new Date().toISOString(),
      calls: 0,
      sourceHash: source.hash,
      sources: source.sources,
      events: [],
      validation: [],
    };
    this.save(
      row,
      "Collected the saved draft, selected lesson and accepted evidence.",
    );
    const running = Promise.resolve()
      .then(() => this.execute(row.id))
      .catch(() => {})
      .finally(() => this.active.delete(row.id));
    this.active.set(row.id, running);
    return row;
  }
  async wait(id: string) {
    await this.active.get(id);
    return this.get(id);
  }
  private validate(row: AgentWork, answer: AgentWorkAnswer) {
    const input = row.request,
      snapshot = this.context(input),
      ids = new Set(row.sources.map((s) => s.id));
    if (snapshot.hash !== row.sourceHash)
      throw new UserError(
        "The source changed during this task. Run it again for the current revision.",
        409,
      );
    const expected = {
      academy: "lesson_package",
      creative: "production_script",
      growth: "channel_post",
      analytics: "analysis_brief",
    }[input.domain];
    if (
      answer.artifacts.some((a) => a.kind !== expected) ||
      (input.domain !== "growth" && answer.artifacts.length !== 1)
    )
      throw new UserError(
        "Return only the deliverable requested for this specialist.",
      );
    const cite = (values: string[]) => {
      if (
        new Set(values).size !== values.length ||
        values.some((id) => !ids.has(id))
      )
        throw new UserError(
          "Every citation must identify a distinct supplied source.",
        );
    };
    for (const a of answer.artifacts) {
      cite(a.sourceIds);
      if (a.kind === "lesson_package") {
        if (a.lessonIndex !== input.lessonIndex)
          throw new UserError(
            `lessonIndex must equal the zero-based selectedLesson ${input.lessonIndex}.`,
          );
        if (a.prerequisiteLessons.some((p) => p >= a.lessonIndex))
          throw new UserError(
            input.lessonIndex === 0
              ? "For selectedLesson 0, prerequisiteLessons MUST be []. The first lesson cannot depend on itself."
              : `prerequisiteLessons may contain only indices 0–${input.lessonIndex - 1}, never the selected lesson ${input.lessonIndex}.`,
          );
        const lessons = structuredClone(snapshot.course.lessons);
        lessons[a.lessonIndex].learn = {
          ...a,
          starterFiles: lessons[a.lessonIndex].learn?.starterFiles || [],
        };
        const issues = learnPackageIssues(lessons);
        if (issues.length) throw new UserError(issues.join(" "));
      }
      if (a.kind === "production_script") {
        if (a.assetId !== input.assetId)
          throw new UserError(
            "Use only the explicitly selected source footage, or null without footage.",
          );
        let duration = 0;
        for (const scene of a.scenes) {
          cite(scene.sourceIds);
          const transcriptSources = row.sources.filter((s) =>
            s.id.startsWith("transcript:"),
          );
          if (snapshot.asset && transcriptSources.length) {
            const cited = transcriptSources
              .filter((s) => scene.sourceIds.includes(s.id))
              .map((s) => JSON.parse(s.text) as { start: number; end: number });
            if (
              !cited.length ||
              scene.start === null ||
              scene.end === null ||
              scene.start < Math.min(...cited.map((c) => c.start)) - 0.05 ||
              scene.end > Math.max(...cited.map((c) => c.end)) + 0.05
            )
              throw new UserError(
                "Each source scene must cite its supplied transcript cues and keep its range inside those cue times.",
              );
          }
          if (!snapshot.asset && (scene.start !== null || scene.end !== null))
            throw new UserError(
              "A script without footage cannot have invented timestamps.",
            );
          if (snapshot.asset) {
            if (
              scene.start === null ||
              scene.end === null ||
              scene.end <= scene.start ||
              scene.end > snapshot.asset.duration
            )
              throw new UserError(
                "Scene timestamps must fit the selected source footage.",
              );
            duration += scene.end - scene.start;
          }
        }
        if (snapshot.asset && (duration < 0.5 || duration > 90))
          throw new UserError("The selected clips must total 0.5–90 seconds.");
        if (scriptCopy(a).length > 8000)
          throw new UserError(
            "Keep the production script below 8,000 characters.",
          );
      }
      if (a.kind === "channel_post") {
        promotionPost.parse({
          provider: a.provider,
          headline: a.title,
          text: a.text,
          caption: a.caption,
          sourceIds: a.sourceIds,
        });
        if (/https?:\/\/|www\./i.test(a.text))
          throw new UserError(
            "Leave URLs out of the post; its tracked destination is appended by OutClass.",
          );
      }
      if (a.kind === "analysis_brief")
        for (const h of a.hypotheses) cite(h.sourceIds);
    }
    if (input.domain === "growth") {
      const providers = answer.artifacts.map((a) =>
        a.kind === "channel_post" ? a.provider : "",
      );
      if (
        providers.length !== input.providers.length ||
        new Set(providers).size !== providers.length ||
        providers.some((p) => !input.providers.includes(p as never))
      )
        throw new UserError(
          "Return exactly one distinct post for every requested channel.",
        );
    }
  }
  private async execute(id: string) {
    let row = this.get(id);
    try {
      const snapshot = this.context(row.request);
      if (snapshot.hash !== row.sourceHash)
        throw new UserError(
          "The source changed before this task started. Reload it and retry.",
          409,
        );
      while (row.calls < row.request.maxCalls) {
        if (this.stopped || this.get(id).phase === "canceled") return;
        row.phase = row.calls ? "repairing" : "drafting";
        row.calls++;
        this.save(
          row,
          row.calls === 1
            ? "Producing the requested deliverable."
            : "Correcting the validation findings within the approved call limit.",
        );
        const payload = {
          ...snapshot.context,
          goal: row.request.goal,
          requestedProviders: row.request.providers,
          validationFindings: row.validation,
          previousAttempt: row.answer || null,
        };
        if (JSON.stringify(payload).length > 85000)
          payload.previousAttempt = null;
        const answer = await this.app.ai.structured({
          task: "work",
          schema: agentWorkAnswer,
          name: "outclass_agent_work",
          instructions: agentWorkInstructions,
          context: JSON.stringify(payload),
        });
        if (this.stopped || this.get(id).phase === "canceled") return;
        row = this.get(id);
        row.answer = agentWorkAnswer.parse(answer);
        row.phase = "checking";
        this.save(
          row,
          "Checking source IDs, source revision, domain constraints and deliverable structure.",
        );
        try {
          this.validate(row, row.answer);
          row.validation = [];
        } catch (error) {
          if (!(error instanceof UserError || error instanceof z.ZodError))
            throw error;
          row.validation = [
            error instanceof z.ZodError
              ? "The artifact did not satisfy its format or channel limits."
              : error.message,
          ];
          this.save(
            row,
            "Validation found a problem; the draft has not been applied.",
          );
          if (error instanceof UserError && error.status === 409) throw error;
          if (row.calls < row.request.maxCalls) continue;
          throw new UserError(row.validation.join(" "));
        }
        row.phase = "ready";
        row.reviewHash = digest({
          answer: row.answer,
          sourceHash: row.sourceHash,
        });
        row.finishedAt = new Date().toISOString();
        this.save(
          row,
          "Deliverable passed structural and source checks. Ready for your review; quality is not certified by these checks.",
        );
        return;
      }
    } catch (error) {
      if (this.stopped || this.get(id).phase === "canceled") return;
      row = this.get(id);
      row.phase = "failed";
      row.error =
        error instanceof UserError
          ? error.message
          : "This task could not finish. Your saved draft was not changed.";
      row.finishedAt = new Date().toISOString();
      this.save(row, "Stopped without applying the draft. Retry is explicit.");
    }
  }
  cancel(id: string) {
    const row = this.get(id);
    if (!inFlight.has(row.phase) || row.phase === "applying")
      throw new UserError("This task can no longer be canceled.", 409);
    row.phase = "canceled";
    row.finishedAt = new Date().toISOString();
    this.save(
      row,
      "Canceled. Any already-started provider request may finish, but its output will be discarded.",
    );
    return row;
  }
  stop() {
    this.stopped = true;
    for (const row of this.list())
      if (inFlight.has(row.phase)) {
        row.phase = "interrupted";
        row.finishedAt = new Date().toISOString();
        row.error = "OutClass closed during this task.";
        this.save(row, "Stopped for app shutdown.");
      }
  }
  offer(id: string, to: AgentDomain) {
    const row = this.get(id);
    if (
      !row.answer ||
      !row.reviewHash ||
      !["ready", "applied"].includes(row.phase)
    )
      throw new UserError(
        "Complete and review the task before offering a handoff.",
      );
    const current = this.proposals.context(
      row.request.domain,
      row.request.entityId,
    ).entity;
    const canonicalRevision =
      row.phase === "applied"
        ? row.delivery?.find((d) => d.id === row.request.entityId)?.revision ||
          row.request.expectedRevision
        : row.request.expectedRevision;
    if (current.revision !== canonicalRevision)
      throw new UserError(
        "The delivered draft changed. Run its specialist again before sharing.",
        409,
      );
    if (row.phase === "ready") this.validate(row, row.answer);
    if (!row.handoffRunId || row.handoffRevision !== canonicalRevision) {
      row.handoffRunId = randomUUID();
      row.handoffRevision = canonicalRevision;
    }
    const provenance = `Task generated from revision ${row.request.expectedRevision}; reviewed source revision ${canonicalRevision}. Structural checks are not factual or learning certification.`;
    const run: ProductAgentRun = {
      id: row.handoffRunId,
      domain: row.request.domain,
      entityId: row.request.entityId,
      revision: canonicalRevision,
      startedAt: row.createdAt,
      finishedAt: row.finishedAt,
      state: "completed",
      maxCalls: row.request.maxCalls,
      sources: row.sources,
      answer: {
        summary: row.answer.summary,
        steps: row.answer.artifacts.map((a) => ({
          title: a.title,
          detail: JSON.stringify(a).slice(0, 1000),
          sourceIds: a.sourceIds,
        })),
        draftText:
          `${provenance}\n\n${JSON.stringify(row.answer.artifacts)}`.slice(
            0,
            5000,
          ),
        limitations: [provenance, ...row.answer.limitations].slice(0, 6),
      },
    };
    const rows =
      this.app.store.get<ProductAgentRun[]>("expansion:agent-runs") || [];
    this.app.store.transaction(() => {
      this.app.store.put(
        "expansion:agent-runs",
        [...rows.filter((r) => r.id !== run.id), run].slice(-40),
      );
      new AgentHandoffs(this.app).offer(run.id, to);
      this.save(
        row,
        `Offered the reviewed deliverable to ${to}; it becomes shared context only after acceptance.`,
      );
    });
    return row;
  }
  async apply(id: string, hash: string) {
    const row = this.get(id);
    if (!row.reviewHash || row.reviewHash !== hash || !row.answer)
      throw new UserError(
        "Review the exact deliverable before applying it.",
        409,
      );
    if (row.phase === "applied") return row;
    if (row.phase !== "ready")
      throw new UserError(
        "Only a completed, reviewed task can be applied.",
        409,
      );
    this.validate(row, row.answer);
    const snapshot = this.context(row.request);
    row.phase = "applying";
    this.save(
      row,
      "Applying the reviewed deliverable through the product tools.",
    );
    try {
      const artifact = row.answer.artifacts[0];
      if (artifact.kind === "lesson_package") {
        this.app.store.transaction(() => {
          const course = structuredClone(snapshot.course),
            lesson = course.lessons[artifact.lessonIndex];
          lesson.objective = artifact.objective;
          lesson.practice = artifact.practice;
          const {
            kind: _kind,
            title: _title,
            sourceIds: _sources,
            lessonIndex: _index,
            objective: _objective,
            practice: _practice,
            ...learn
          } = artifact;
          lesson.learn = {
            ...learn,
            starterFiles: lesson.learn?.starterFiles || [],
          };
          const next = this.expansion.saveCourse({
            id: row.request.entityId,
            expectedRevision: row.request.expectedRevision,
            title: course.title,
            audience: course.audience,
            outcome: course.outcome,
            rightsConfirmed: course.rightsConfirmed,
            lessons: course.lessons,
          });
          row.delivery = [
            {
              kind: "course",
              id: next.id,
              revision: next.revision,
              label: `Updated ${lesson.title} and its Learn assignment`,
            },
          ];
          row.phase = "applied";
          this.save(
            row,
            "Saved the course revision. Publishing and learner work remain separate.",
          );
        });
      } else if (artifact.kind === "production_script") {
        this.app.store.transaction(() => {
          const current = this.expansion
            .state()
            .creatives.find((c) => c.id === row.request.entityId)!;
          const next = this.expansion.saveCreative({
            id: current.id,
            expectedRevision: current.revision,
            title: current.title,
            releaseId: current.releaseId,
            lessonIndex: current.lessonIndex,
            brief: current.brief,
            copy: scriptCopy(artifact),
            brandColor: current.brandColor,
            rightsConfirmed: current.rightsConfirmed,
          });
          if (artifact.assetId) {
            const old = this.media
              .state()
              .drafts.find((d) => d.creativeId === next.id);
            this.media.saveTimeline({
              creativeId: next.id,
              expectedRevision: next.revision,
              expectedTimelineRevision: old?.revision || 0,
              assetId: artifact.assetId,
              format: artifact.format,
              scenes: artifact.scenes.map((s) => ({
                start: s.start!,
                end: s.end!,
                caption: s.caption,
              })),
            });
          }
          row.delivery = [
            {
              kind: "creative",
              id: next.id,
              revision: next.revision,
              label: artifact.assetId
                ? "Saved production script and editable source timeline"
                : "Saved the production script; add footage when ready",
            },
          ];
          row.phase = "applied";
          this.save(
            row,
            "Saved the creative revision. Playback/render review remains explicit.",
          );
        });
      } else if (artifact.kind === "channel_post") {
        const gtm = new GTMStudio(this.app, this.media),
          campaign = this.expansion
            .state()
            .campaigns.find((c) => c.id === row.request.entityId)!;
        if (!row.promotionId) {
          const posts = row.answer.artifacts.map((a) => {
            if (a.kind !== "channel_post")
              throw new UserError("Unexpected channel deliverable.");
            return {
              provider: a.provider,
              headline: a.title,
              text: a.text,
              caption: a.caption,
              sourceIds: a.sourceIds,
            };
          });
          const plan = await gtm.create(
            {
              rightsConfirmed: true,
              releaseId: snapshot.release!.id,
              lessonIndex: row.request.lessonIndex,
              title: campaign.title,
              audience: campaign.goal || snapshot.course.audience,
              destination: campaign.destination,
              providers: row.request.providers,
              mode: "agent",
              approveProvider: false,
            },
            {
              answer: {
                summary: row.answer.summary,
                posts,
                limitations: row.answer.limitations,
              },
              sources: row.sources,
            },
          );
          row.promotionId = plan.id;
          this.save(row, "Saved the source-linked promotion plan.");
        }
        this.validate(row, row.answer);
        const plan = gtm.materialize(
          row.promotionId,
          gtm.plan(row.promotionId).revision,
        );
        row.delivery = plan.artifacts.map((a) => ({
          kind: "campaign",
          id: a.campaignId!,
          label: `${a.provider} draft ready for composing and media review`,
        }));
        row.phase = "applied";
        this.save(
          row,
          "Prepared reviewed local channel campaigns. Nothing was published or scheduled.",
        );
      } else {
        row.delivery = [
          {
            kind: "analysis",
            id: row.id,
            label:
              "Saved the evidence brief and bounded experiment recommendations",
          },
        ];
        row.phase = "applied";
        this.save(
          row,
          "Saved analysis separately from measured provider data.",
        );
      }
      return row;
    } catch (error) {
      row.phase = "ready";
      row.error =
        error instanceof UserError
          ? error.message
          : "Delivery could not finish. Review the source and retry applying.";
      row.delivery = undefined;
      this.save(
        row,
        "Delivery did not finish; saved receipts prevent duplicate channel preparation.",
      );
      throw error;
    }
  }
  routes() {
    const router = Router();
    router.get("/", (_req, res) => res.json(this.list()));
    router.get("/context", (req, res) => {
      const state = this.expansion.state();
      const pinned =
        state.creatives.find((c) => c.id === req.query.entityId)?.lessonIndex ??
        state.campaigns.find((c) => c.id === req.query.entityId)
          ?.creativeSnapshot.lessonIndex ??
        0;
      const input = agentWorkRequest
        .pick({
          domain: true,
          entityId: true,
          lessonIndex: true,
          assetId: true,
        })
        .parse({
          ...req.query,
          lessonIndex:
            req.query.lessonIndex === undefined
              ? pinned
              : Number(req.query.lessonIndex),
          assetId: req.query.assetId || null,
        });
      const s = this.context(input);
      res.json({
        revision: s.entity.revision,
        lessons: s.course.lessons.map((l, index) => ({
          index,
          title: l.title,
        })),
        sources: s.sources.map((s) => ({ id: s.id, title: s.title })),
        assets: this.media.state().assets.map((a) => ({
          id: a.id,
          name: a.name,
          duration: a.duration,
          transcriptCues:
            new MediaTranscripts(this.app, this.media).get(a.id)?.cues.length ||
            0,
        })),
        pinnedLesson: s.creative?.lessonIndex ?? null,
      });
    });
    router.post("/start", (req, res) =>
      res.status(202).json(this.start(req.body)),
    );
    router.get("/:id", (req, res) =>
      res.json(this.get(z.string().uuid().parse(req.params.id))),
    );
    router.post("/:id/cancel", (req, res) => {
      z.object({}).strict().parse(req.body);
      res.json(this.cancel(z.string().uuid().parse(req.params.id)));
    });
    router.post("/:id/apply", async (req, res) => {
      const input = z
        .object({ reviewHash: z.string().length(64), approve: z.literal(true) })
        .strict()
        .parse(req.body);
      res.json(
        await this.apply(
          z.string().uuid().parse(req.params.id),
          input.reviewHash,
        ),
      );
    });
    router.post("/:id/handoff", (req, res) => {
      const input = z
        .object({ to: agentDomain, approve: z.literal(true) })
        .strict()
        .parse(req.body);
      res.json(this.offer(z.string().uuid().parse(req.params.id), input.to));
    });
    return router;
  }
}
function scriptCopy(
  a: Extract<
    AgentWorkAnswer["artifacts"][number],
    { kind: "production_script" }
  >,
) {
  return a.scenes
    .map((s, i) => `${i + 1}. ${s.caption}\n${s.narration}`)
    .join("\n\n");
}
