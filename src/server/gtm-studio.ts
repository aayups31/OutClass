import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Application } from "./application.js";
import { Expansion } from "./expansion.js";
import { CreatorProduction } from "./creator-production.js";
import {
  promotionAnswer,
  promotionInstructions,
  socialProvider,
} from "../promotion-contract.js";
import { AgentHandoffs } from "./agent-handoffs.js";
import { assertClean, UserError } from "./safety.js";
import { designExport } from "./creator-design.js";
const request = z
  .object({
    rightsConfirmed: z.literal(true),
    releaseId: z.string().uuid(),
    lessonIndex: z.number().int().min(0).max(29),
    title: z.string().trim().min(1).max(150),
    audience: z.string().trim().min(1).max(1500),
    destination: z.string().url().max(2000),
    providers: z.array(socialProvider).min(1).max(4),
    mode: z.enum(["source", "agent"]),
    approveProvider: z.boolean(),
  })
  .strict();
export type PromotionPlan = {
  sources?: { id: string; title: string; text: string }[];
  id: string;
  revision: number;
  releaseId: string;
  releaseHash: string;
  lessonIndex: number;
  title: string;
  audience: string;
  destination: string;
  createdAt: string;
  provenance: "source_template" | "agent_draft";
  answer: z.infer<typeof promotionAnswer>;
  artifacts: {
    provider: z.infer<typeof socialProvider>;
    creativeId?: string;
    campaignId?: string;
    renderId?: string;
  }[];
};
export class GTMStudio {
  private active = false;
  constructor(
    private app: Application,
    private media: CreatorProduction,
  ) {}
  list() {
    return this.app.store.get<PromotionPlan[]>("gtm:promotions:v1") || [];
  }
  private save(plan: PromotionPlan) {
    this.app.store.put("gtm:promotions:v1", [
      ...this.list().filter((p) => p.id !== plan.id),
      plan,
    ]);
  }
  plan(id: string) {
    const p = this.list().find((p) => p.id === id);
    if (!p) throw new UserError("Promotion plan not found.", 404);
    return p;
  }
  async create(
    raw: unknown,
    reviewedAnswer?: {
      answer: z.infer<typeof promotionAnswer>;
      sources: { id: string; title: string; text: string }[];
    },
  ) {
    const input = request.parse(raw);
    assertClean(JSON.stringify(input), "promotion brief");
    const url = new URL(input.destination);
    if (url.protocol !== "https:" || url.username || url.password)
      throw new UserError("Use an HTTPS destination without credentials.");
    if (new Set(input.providers).size !== input.providers.length)
      throw new UserError("Choose each channel once.");
    if (this.active)
      throw new UserError("Another promotion draft is being created.", 409);
    if (this.list().length >= 60)
      throw new UserError("The local promotion plan limit has been reached.");
    const release = new Expansion(this.app)
        .state()
        .releases.find((r) => r.id === input.releaseId),
      lesson = release?.lessons[input.lessonIndex];
    if (!release || !lesson)
      throw new UserError("Choose an authorized local release and lesson.");
    const sources = [
      {
        id: `course:${release.id}`,
        title: release.title,
        text: release.outcome,
      },
      {
        id: `lesson:${input.lessonIndex}`,
        title: lesson.title,
        text: `${lesson.objective}\n${lesson.practice}\n${lesson.content}`.slice(
          0,
          6500,
        ),
      },
      ...new AgentHandoffs(this.app).sources("growth", release.id),
      ...(reviewedAnswer?.sources || []),
    ];
    this.active = true;
    try {
      // Internal agent-work delivery reuses the same source/channel validators.
      // HTTP callers can only supply the first argument.
      const generated =
        reviewedAnswer?.answer ??
        (input.mode === "agent"
          ? await (async () => {
              if (!input.approveProvider)
                throw new UserError("Approve this one provider call first.");
              return this.app.ai.structured({
                task: "promotion",
                schema: promotionAnswer,
                name: "outclass_channel_promotions",
                instructions: promotionInstructions,
                context: JSON.stringify({
                  course: release.title,
                  audience: input.audience,
                  requestedProviders: input.providers,
                  sources,
                  request:
                    "Create channel-specific drafts from this lesson. The user will select and review any source footage separately.",
                }),
              });
            })()
          : {
              summary:
                "Source-based promotional drafts. No model call was used.",
              posts: input.providers.map((provider) => ({
                provider,
                headline: release.title.slice(0, 100),
                text:
                  provider === "x"
                    ? `${lesson.title.slice(0, 50)}. ${lesson.objective.slice(0, 70)}. Explore the course.`
                    : `${release.title}\n\n${lesson.objective.slice(0, 500)}\n\nPractice: ${lesson.practice.slice(0, 800)}\n\nExplore the lesson and build your own version.`,
                caption: lesson.title.slice(0, 150),
                sourceIds: [
                  `course:${release.id}`,
                  `lesson:${input.lessonIndex}`,
                ],
              })),
              limitations: [
                "Drafts describe the course material; they are not evidence of learner outcomes. Source footage must be selected and reviewed separately.",
              ],
            });
      const answer = promotionAnswer.parse(generated),
        ids = new Set(sources.map((s) => s.id));
      if (
        answer.posts.length !== input.providers.length ||
        new Set(answer.posts.map((p) => p.provider)).size !==
          input.providers.length ||
        answer.posts.some(
          (p) =>
            !input.providers.includes(p.provider) ||
            p.sourceIds.some((id) => !ids.has(id)),
        )
      )
        throw new UserError(
          "The draft did not match the requested channels and supplied sources. It was not saved.",
        );
      if (
        answer.posts.some(
          (p) => p.provider === "x" && Array.from(p.text).length > 170,
        )
      )
        throw new UserError(
          "The generated X draft is too long. Try a narrower brief.",
        );
      assertClean(JSON.stringify(answer), "promotion draft");
      const plan: PromotionPlan = {
        id: randomUUID(),
        revision: 1,
        releaseId: release.id,
        releaseHash: release.hash,
        lessonIndex: input.lessonIndex,
        title: input.title,
        audience: input.audience,
        destination: url.href,
        createdAt: new Date().toISOString(),
        provenance: input.mode === "agent" ? "agent_draft" : "source_template",
        answer,
        sources,
        artifacts: [],
      };
      this.save(plan);
      return plan;
    } finally {
      this.active = false;
    }
  }
  edit(id: string, raw: unknown) {
    const value = z
        .object({
          expectedRevision: z.number().int(),
          posts: promotionAnswer.shape.posts,
        })
        .strict()
        .parse(raw),
      plan = this.plan(id);
    if (plan.revision !== value.expectedRevision || plan.artifacts.length)
      throw new UserError(
        "This plan changed or already has approved artifacts. Create another plan.",
        409,
      );
    if (
      value.posts.length !== plan.answer.posts.length ||
      value.posts.some(
        (p, i) =>
          p.provider !== plan.answer.posts[i].provider ||
          JSON.stringify(p.sourceIds) !==
            JSON.stringify(plan.answer.posts[i].sourceIds),
      )
    )
      throw new UserError("Keep the plan's channel and source references.");
    assertClean(JSON.stringify(value.posts), "promotion copy");
    plan.answer.posts = value.posts;
    plan.revision++;
    this.save(plan);
    return plan;
  }
  materialize(id: string, revision: number) {
    const plan = this.plan(id);
    if (plan.revision !== revision)
      throw new UserError("Review the current plan revision.", 409);
    const e = new Expansion(this.app),
      release = e.state().releases.find((r) => r.id === plan.releaseId);
    if (release?.hash !== plan.releaseHash)
      throw new UserError(
        "The source release no longer matches this plan.",
        409,
      );
    for (const post of plan.answer.posts) {
      let artifact = plan.artifacts.find((a) => a.provider === post.provider);
      if (!artifact) {
        artifact = { provider: post.provider };
        plan.artifacts.push(artifact);
        this.save(plan);
      }
      if (!artifact.creativeId) {
        const creative = e.saveCreative({
          title: post.headline,
          releaseId: plan.releaseId,
          lessonIndex: plan.lessonIndex,
          brief: `GTM-produced ${post.provider} promotion. Audience: ${plan.audience}`,
          copy: post.text,
          brandColor: "#386bfa",
          rightsConfirmed: release.rightsConfirmed,
          expectedRevision: 0,
        });
        artifact.creativeId = creative.id;
        this.save(plan);
      }
      const creative = e
        .state()
        .creatives.find((c) => c.id === artifact.creativeId)!;
      if (
        !creative ||
        creative.copy !== post.text ||
        creative.releaseId !== plan.releaseId ||
        creative.lessonIndex !== plan.lessonIndex
      )
        throw new UserError(
          "This shared creative changed outside the promotion plan. Create and review another plan.",
          409,
        );
      if (!creative.approval)
        e.approveCreative(creative.id, {
          expectedRevision: creative.revision,
          approve: true,
        });
      if (!artifact.campaignId) {
        const campaign = e.saveCampaign({
          title: `${plan.title} · ${post.provider}`,
          creativeId: creative.id,
          destination: plan.destination,
          source: post.provider,
          medium: "organic",
          goal: plan.audience,
          budgetMinor: 0,
          currency: "CAD",
          expectedRevision: 0,
        });
        artifact.campaignId = campaign.id;
        this.save(plan);
      }
    }
    return plan;
  }
  render(id: string, raw: unknown) {
    const value = z
        .object({
          provider: socialProvider,
          assetId: z.string().uuid(),
          start: z.number().finite().min(0),
          end: z.number().finite().positive(),
          approveRender: z.literal(true),
        })
        .strict()
        .parse(raw),
      plan = this.plan(id),
      artifact = plan.artifacts.find((a) => a.provider === value.provider),
      post = plan.answer.posts.find((p) => p.provider === value.provider);
    if (!artifact?.creativeId || !post)
      throw new UserError("Review and prepare this promotion's copy first.");
    if (artifact.renderId) {
      const old = this.media
        .state()
        .jobs.find((j) => j.id === artifact.renderId);
      if (old && ["queued", "processing", "ready"].includes(old.state)) {
        if (
          old.timeline.assetId === value.assetId &&
          old.timeline.scenes.length === 1 &&
          old.timeline.scenes[0].start === value.start &&
          old.timeline.scenes[0].end === value.end &&
          old.timeline.scenes[0].caption === post.caption
        )
          return old;
        if (old.state !== "ready")
          throw new UserError(
            "Wait for or cancel this preview before rendering a different source range.",
            409,
          );
      }
    }
    const creative = new Expansion(this.app)
      .state()
      .creatives.find((c) => c.id === artifact.creativeId)!;
    if (!creative || creative.copy !== post.text || !creative.approval)
      throw new UserError(
        "The approved promotional creative changed. Review a new plan before rendering.",
        409,
      );
    const job = this.media.render({
      creativeId: creative.id,
      expectedRevision: creative.revision,
      assetId: value.assetId,
      format: value.provider === "youtube" ? "landscape" : "portrait",
      scenes: [{ start: value.start, end: value.end, caption: post.caption }],
      approveRender: true,
    });
    artifact.renderId = job.id;
    this.save(plan);
    return job;
  }
  design(id: string, provider: z.infer<typeof socialProvider>) {
    const artifact = this.plan(id).artifacts.find(
        (a) => a.provider === provider,
      ),
      creative = new Expansion(this.app)
        .state()
        .creatives.find((c) => c.id === artifact?.creativeId);
    if (!creative)
      throw new UserError(
        "Prepare this promotion's copy before exporting its design.",
      );
    if (
      creative.copy !==
      this.plan(id).answer.posts.find((p) => p.provider === provider)?.text
    )
      throw new UserError(
        "The shared creative changed. Review a new promotion before exporting.",
        409,
      );
    return designExport(creative, provider === "youtube" ? "wide" : "square");
  }
  routes() {
    const router = Router();
    router.get("/", (_req, res) => res.json(this.list()));
    router.post("/create", async (req, res) =>
      res.json(await this.create(req.body)),
    );
    router.post("/:id/edit", (req, res) =>
      res.json(this.edit(req.params.id, req.body)),
    );
    router.post("/:id/prepare", (req, res) => {
      const input = z
        .object({
          expectedRevision: z.number().int(),
          approveCopy: z.literal(true),
        })
        .strict()
        .parse(req.body);
      res.json(this.materialize(req.params.id, input.expectedRevision));
    });
    router.post("/:id/render", (req, res) =>
      res.json(this.render(req.params.id, req.body)),
    );
    router.post("/:id/design", (req, res) =>
      res.json(
        this.design(req.params.id, socialProvider.parse(req.body.provider)),
      ),
    );
    return router;
  }
}
