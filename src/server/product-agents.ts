import { randomUUID } from "node:crypto";
import type { Application } from "./application.js";
import type { ExpansionState } from "../expansion-contract.js";
import {
  productAgentAnswer,
  productAgentInstructions,
} from "../product-agent-contract.js";
import { UserError } from "./safety.js";
import { GTMAnalytics } from "./gtm-analytics.js";
import { AgentHandoffs, type AgentDomain } from "./agent-handoffs.js";
export type ProductAgentRun = {
  id: string;
  domain: AgentDomain;
  entityId: string;
  revision: number;
  startedAt: string;
  finishedAt?: string;
  state: "executing" | "completed" | "failed" | "interrupted";
  error?: string;
  sources: { id: string; title: string; text: string }[];
  answer?: ReturnType<typeof productAgentAnswer.parse>;
  maxCalls: 1 | 2;
};
export class ProductAgents {
  private active = new Set<string>();
  constructor(
    private app: Application,
    private state: () => ExpansionState,
  ) {}
  context(domain: ProductAgentRun["domain"], entityId: string) {
    const state = this.state();
    const entity =
      domain === "academy"
        ? state.courses.find((c) => c.id === entityId)
        : domain === "creative"
          ? state.creatives.find((c) => c.id === entityId)
          : state.campaigns.find((c) => c.id === entityId);
    if (!entity)
      throw new UserError(
        "Save and select a draft before asking its agent.",
        404,
      );
    const release =
      domain === "creative"
        ? state.releases.find(
            (r) =>
              r.id ===
              state.creatives.find((c) => c.id === entityId)!.releaseId,
          )
        : domain === "growth" || domain === "analytics"
          ? state.releases.find(
              (r) =>
                r.id ===
                state.campaigns.find((c) => c.id === entityId)!.creativeSnapshot
                  .releaseId,
            )
          : undefined;
    const lessons =
      domain === "academy"
        ? state.courses.find((c) => c.id === entityId)!.lessons
        : release?.lessons || [];
    const focus =
      domain === "creative"
        ? state.creatives.find((c) => c.id === entityId)?.lessonIndex
        : domain === "growth" || domain === "analytics"
          ? state.campaigns.find((c) => c.id === entityId)?.creativeSnapshot
              .lessonIndex
          : undefined;
    const sourceLessons = lessons
      .map((lesson, index) => ({ lesson, index }))
      .filter((item) => focus === undefined || item.index === focus)
      .slice(0, 6);
    const sources = sourceLessons.map(({ lesson: l, index: i }) => ({
      id: `lesson:${i}`,
      title: l.title,
      text: `Objective: ${l.objective}\nPractice: ${l.practice}\n${l.content}`.slice(
        0,
        2000,
      ),
    }));
    if (domain === "growth" || domain === "analytics")
      for (const r of new GTMAnalytics(this.app, this.state)
        .view(entityId)
        .reports.slice(-4))
        sources.push({
          id: `report:${r.id}`,
          title: `Manually supplied ${r.source} report · ${r.date}`,
          text: JSON.stringify(r).slice(0, 2000),
        });
    if (domain === "growth" || domain === "analytics") {
      for (const trend of new GTMAnalytics(this.app, this.state)
        .view(entityId)
        .trends.slice(-4))
        sources.push({
          id: `trend:${trend.current.id}`,
          title: `${trend.current.provider} observed count history`,
          text: JSON.stringify(trend).slice(0, 2000),
        });
      const posts = (
        this.app.store.get<
          {
            id: string;
            campaignId: string;
            provider: string;
            state: string;
            metrics?: unknown;
          }[]
        >("gtm:publication:v1") || []
      )
        .filter((p) => p.campaignId === entityId && p.metrics)
        .slice(-4);
      for (const post of posts)
        sources.push({
          id: `observation:${post.id}`,
          title: `${post.provider} provider observation`,
          text: JSON.stringify({
            state: post.state,
            metrics: post.metrics,
          }).slice(0, 2000),
        });
    }
    sources.push(
      ...new AgentHandoffs(this.app).sources(
        domain,
        release?.id,
        domain === "academy" ? entityId : undefined,
      ),
    );
    return {
      entity,
      revision: entity.revision,
      sources,
      provider: this.app.ai.config().mode,
      maxCalls: 1,
      maxOutputTokens: 1800,
    };
  }
  list() {
    const runs =
      this.app.store.get<ProductAgentRun[]>("expansion:agent-runs") || [];
    return runs.map((r) =>
      r.state === "executing" && !this.active.has(r.entityId)
        ? {
            ...r,
            state: "interrupted" as const,
            error: "The app restarted during this run. Retry explicitly.",
          }
        : r,
    );
  }
  private save(record: ProductAgentRun) {
    const runs =
      this.app.store.get<ProductAgentRun[]>("expansion:agent-runs") || [];
    this.app.store.put(
      "expansion:agent-runs",
      [...runs.filter((r) => r.id !== record.id), record].slice(-40),
    );
  }
  async run(
    domain: ProductAgentRun["domain"],
    entityId: string,
    revision: number,
  ) {
    if (this.active.has(entityId) || this.active.size >= 2)
      throw new UserError("Another agent run is in progress.", 409);
    const context = this.context(domain, entityId);
    if (context.revision !== revision)
      throw new UserError("Reload this draft before asking its agent.", 409);
    if (!this.app.ai.ready())
      throw new UserError("Choose an AI connection in Settings first.");
    const record: ProductAgentRun = {
      id: randomUUID(),
      domain,
      entityId,
      revision,
      startedAt: new Date().toISOString(),
      state: "executing",
      sources: context.sources,
      maxCalls: 1,
    };
    this.active.add(entityId);
    this.save(record);
    try {
      const answer = await this.app.ai.structured({
        task: domain,
        schema: productAgentAnswer,
        name: `outclass_${domain}_proposal`,
        instructions: productAgentInstructions[domain],
        context: JSON.stringify({
          draftExcerpt: JSON.stringify(context.entity).slice(0, 8000),
          sources: context.sources,
          request:
            "Propose the next useful revision, with source-grounded editable draft text. The draft excerpt may be truncated.",
        }),
      });
      const ids = new Set(context.sources.map((s) => s.id));
      if (this.context(domain, entityId).revision !== revision)
        throw new UserError(
          "The draft changed during this proposal. Run the agent again for the current revision.",
          409,
        );
      if (answer.steps.some((s) => s.sourceIds.some((id) => !ids.has(id))))
        throw new UserError(
          "The proposal referenced a source that was not supplied. It was not applied.",
        );
      record.answer = answer;
      record.state = "completed";
    } catch (error) {
      record.state = "failed";
      record.error =
        error instanceof UserError
          ? error.message
          : "This agent could not produce a valid proposal. No draft was changed.";
    } finally {
      this.active.delete(entityId);
      record.finishedAt = new Date().toISOString();
      this.save(record);
    }
    return record;
  }
}
