import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../src/server/store";
import { Application } from "../src/server/application";
import { Expansion } from "../src/server/expansion";
import { CreatorProduction } from "../src/server/creator-production";
import { AgentWorkService } from "../src/server/agent-work";
import {
  agentWorkAnswer,
  type AgentWorkRequest,
} from "../src/agent-work-contract";
import { GTMAnalytics } from "../src/server/gtm-analytics";
let dir: string,
  store: Store,
  app: Application,
  expansion: Expansion,
  media: CreatorProduction,
  work: AgentWorkService;
const sourceLesson = {
  title: "Useful collections",
  objective: "Group records by person",
  practice: "Build an activity report",
  content: "A dictionary maps a person to their recorded activity.",
};
const lessonAnswer = (index = 0) => ({
  summary: "A practical exercise connected to the lesson.",
  artifacts: [
    {
      kind: "lesson_package" as const,
      title: "Build an activity summary",
      sourceIds: [`lesson:${index}`],
      lessonIndex: index,
      objective: "Produce one total for each person",
      practice: "Aggregate the supplied records and test an empty collection.",
      minutes: 20,
      prerequisiteLessons: [],
      acceptanceCriteria: [
        "Repeated people are grouped into one total.",
        "Empty input produces an empty result.",
      ],
      hints: [
        "Which value identifies each group?",
        "Trace one repeated person before choosing an update.",
      ],
      reflection:
        "What did your repeated-person and empty-input examples show?",
      transferChallenge:
        "Support a different grouping field without duplicating the algorithm.",
    },
  ],
  limitations: [
    "Instructor review is needed; these checks do not execute arbitrary code.",
  ],
});
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "outclass-agent-work-"));
  store = new Store(path.join(dir, "data"));
  app = new Application(store, "synthetic-fixture-key");
  await app.setup(path.join(dir, "history"), false);
  expansion = new Expansion(app);
  media = new CreatorProduction(app, () => expansion.state());
  work = new AgentWorkService(app, expansion, media);
});
afterEach(async () => {
  work.stop();
  media.stop();
  vi.restoreAllMocks();
  store.close();
  await rm(dir, { recursive: true, force: true });
});
function course() {
  return expansion.saveCourse({
    title: "Practical Python",
    audience: "Beginners",
    outcome: "Build a report",
    rightsConfirmed: true,
    lessons: [
      {
        ...sourceLesson,
        learn: {
          minutes: 15,
          prerequisiteLessons: [],
          acceptanceCriteria: ["Preserve the starter"],
          hints: [],
          reflection: "",
          transferChallenge: "",
          starterFiles: [{ path: "main.py", content: "# Learner starter\n" }],
        },
      },
    ],
    expectedRevision: 0,
  });
}
function request(
  domain: AgentWorkRequest["domain"],
  entityId: string,
  extra: Partial<AgentWorkRequest> = {},
) {
  return {
    requestId: randomUUID(),
    domain,
    entityId,
    expectedRevision: 1,
    goal: "Create useful source-grounded work for this lesson",
    lessonIndex: 0,
    assetId: null,
    providers: [],
    maxCalls: 2,
    approveProvider: true,
    ...extra,
  } as AgentWorkRequest;
}
function released() {
  const c = course(),
    release = expansion.release(c.id, { expectedRevision: 1, approve: true });
  const creative = expansion.saveCreative({
    title: "Activity report preview",
    releaseId: release.id,
    lessonIndex: 0,
    brief: "Explain the actual lesson",
    copy: "Group activity records by person.",
    brandColor: "#386bfa",
    rightsConfirmed: true,
    expectedRevision: 0,
  });
  expansion.approveCreative(creative.id, {
    expectedRevision: 1,
    approve: true,
  });
  const campaign = expansion.saveCampaign({
    title: "Practical reports",
    creativeId: creative.id,
    destination: "https://example.com/course",
    source: "linkedin",
    medium: "organic",
    goal: "Reach learners who want to organize records",
    budgetMinor: 0,
    currency: "CAD",
    expectedRevision: 0,
  });
  return { c, release, creative, campaign };
}
it("delivers a reviewed assignment through Academy into real Learn, preserving starter files and idempotent application", async () => {
  const c = course(),
    model = vi.spyOn(app.ai, "structured").mockResolvedValue(lessonAnswer());
  const input = request("academy", c.id),
    started = work.start(input);
  expect(work.start(input).id).toBe(started.id);
  const ready = await work.wait(started.id);
  expect(ready.phase).toBe("ready");
  expect(model).toHaveBeenCalledTimes(1);
  expect(expansion.state().courses[0].revision).toBe(1);
  await expect(work.apply(ready.id, "0".repeat(64))).rejects.toThrow(/exact/);
  const delivered = await work.apply(ready.id, ready.reviewHash!);
  expect(delivered.phase).toBe("applied");
  expect(expansion.state().courses[0].revision).toBe(2);
  await work.apply(ready.id, ready.reviewHash!);
  expect(expansion.state().courses[0].revision).toBe(2);
  expect(
    expansion.state().courses[0].lessons[0].learn!.starterFiles[0].content,
  ).toContain("Learner starter");
  const release = expansion.release(c.id, {
    expectedRevision: 2,
    approve: true,
  });
  expansion.enroll(release.id);
  await expansion.launch(release.id, 0);
  expect(store.state().session?.lessonTitle).toBe(sourceLesson.title);
  expect(release.lessons[0].learn!.acceptanceCriteria).toContain(
    "Empty input produces an empty result.",
  );
});
it("repairs invalid citations once, records the findings and obeys the approved call budget", async () => {
  const c = course(),
    invalid = lessonAnswer();
  invalid.artifacts[0].sourceIds = ["invented"];
  const model = vi
    .spyOn(app.ai, "structured")
    .mockResolvedValueOnce(invalid)
    .mockResolvedValueOnce(lessonAnswer());
  const row = await work.wait(work.start(request("academy", c.id)).id);
  expect(row.phase).toBe("ready");
  expect(row.calls).toBe(2);
  expect(model).toHaveBeenCalledTimes(2);
  expect(model.mock.calls[1][0].context).toContain("Every citation");
  expect(row.events.some((e) => e.message.includes("Correcting"))).toBe(true);
  model.mockResolvedValue(invalid);
  const failed = await work.wait(
    work.start(request("academy", c.id, { maxCalls: 1 })).id,
  );
  expect(failed.phase).toBe("failed");
  expect(failed.calls).toBe(1);
  expect(expansion.state().courses[0].revision).toBe(1);
});
it("blocks source changes during generation and stale application without replacing instructor work", async () => {
  const c = course();
  let finish!: (v: unknown) => void;
  vi.spyOn(app.ai, "structured").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const started = work.start(request("academy", c.id));
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  expansion.saveCourse({
    title: c.title,
    audience: c.audience,
    outcome: c.outcome,
    rightsConfirmed: true,
    lessons: [{ ...sourceLesson, practice: "My changed assignment" }],
    id: c.id,
    expectedRevision: 1,
  });
  finish(lessonAnswer());
  const row = await work.wait(started.id);
  expect(row.phase).toBe("failed");
  expect(row.calls).toBe(1);
  expect(expansion.state().courses[0].lessons[0].practice).toBe(
    "My changed assignment",
  );
});
it("discards late results after cancellation and saves interruption receipts without automatic retries", async () => {
  const c = course();
  let finish!: (v: unknown) => void;
  vi.spyOn(app.ai, "structured").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const started = work.start(request("academy", c.id));
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  work.cancel(started.id);
  finish(lessonAnswer());
  expect((await work.wait(started.id)).phase).toBe("canceled");
  expect(work.get(started.id).answer).toBeUndefined();
  const restarted = {
    ...work.get(started.id),
    id: randomUUID(),
    phase: "drafting",
    answer: undefined,
  };
  store.put("suite:work:v1", [restarted]);
  const resumed = new AgentWorkService(app, expansion, media);
  expect(resumed.list()[0].phase).toBe("interrupted");
  expect(resumed.list()[0].calls).toBe(1);
  resumed.stop();
});
it("creates an editable production script and real source timeline, invalidates old approvals, and rolls back failed delivery", async () => {
  const { creative } = released(),
    assetId = randomUUID();
  store.put("creator:production:v1", {
    assets: [
      {
        id: assetId,
        name: "Owned lesson.mp4",
        mime: "video/mp4",
        hash: "b".repeat(64),
        bytes: 2000,
        duration: 10,
        width: 1280,
        height: 720,
        audio: true,
        rightsConfirmed: true,
        importedAt: new Date().toISOString(),
      },
    ],
    jobs: [],
    drafts: [],
  });
  const answer = {
    summary: "A short two-scene teaching preview.",
    artifacts: [
      {
        kind: "production_script",
        title: "Grouping records",
        sourceIds: ["lesson:0"],
        format: "landscape",
        assetId,
        scenes: [
          {
            narration: "Start with a repeated person in your records.",
            caption: "Look for repeated people",
            sourceIds: ["lesson:0"],
            start: 0,
            end: 3,
          },
          {
            narration: "Trace how the total changes for that person.",
            caption: "Trace the update",
            sourceIds: ["lesson:0"],
            start: 3,
            end: 8,
          },
        ],
      },
    ],
    limitations: [
      "Footage alignment is provisional; review the source before rendering.",
    ],
  };
  vi.spyOn(app.ai, "structured").mockResolvedValue(answer);
  const row = await work.wait(
    work.start(request("creative", creative.id, { assetId })).id,
  );
  expect(row.phase).toBe("ready");
  const save = vi.spyOn(media, "saveTimeline").mockImplementationOnce(() => {
    throw Error("Synthetic timeline failure");
  });
  await expect(work.apply(row.id, row.reviewHash!)).rejects.toThrow(
    "Synthetic timeline",
  );
  expect(expansion.state().creatives[0].revision).toBe(1);
  expect(expansion.state().creatives[0].approval).toBeDefined();
  save.mockRestore();
  await work.apply(row.id, row.reviewHash!);
  expect(media.state().drafts[0].timeline.scenes).toHaveLength(2);
  expect(expansion.state().creatives[0].revision).toBe(2);
  expect(expansion.state().creatives[0].approval).toBeUndefined();
  expect(media.state().jobs).toHaveLength(0);
});
it("materializes distinct reviewed channel campaigns and retains sources without publishing or duplicate writes", async () => {
  const { campaign } = released(),
    providers = ["youtube", "linkedin", "x", "instagram"] as const;
  vi.spyOn(app.ai, "structured").mockResolvedValue({
    summary: "Four source-grounded channel drafts.",
    artifacts: providers.map((provider) => ({
      kind: "channel_post",
      title: `${provider} activity report`,
      sourceIds: ["lesson:0"],
      provider,
      text: `${provider}: Trace repeated records and build your own grouping example.`,
      caption: "Build an activity report",
    })),
    limitations: ["Review the media and final composer before publishing."],
  });
  const row = await work.wait(
    work.start(request("growth", campaign.id, { providers: [...providers] }))
      .id,
  );
  expect(row.phase).toBe("ready");
  const applied = await work.apply(row.id, row.reviewHash!);
  expect(applied.delivery).toHaveLength(4);
  expect(expansion.state().campaigns).toHaveLength(5);
  expect(store.get("gtm:publication:v1")).toBeUndefined();
  await work.apply(row.id, row.reviewHash!);
  expect(expansion.state().campaigns).toHaveLength(5);
  expect(
    (store.get<any[]>("gtm:promotions:v1")![0].sources as any[]).some(
      (s) => s.id === "lesson:0",
    ),
  ).toBe(true);
});
it("separates analytics interpretations from actual supplied metrics and keeps private learner data out of context", async () => {
  const { campaign } = released();
  store.put("private-learner-memory", "NEVER_INCLUDE_LEARNER_CONTENT");
  new GTMAnalytics(app, () => expansion.state()).record({
    campaignId: campaign.id,
    source: "manual spreadsheet",
    date: "2026-10-20",
    currency: "CAD",
    impressions: 100,
    clicks: 5,
    spendMinor: null,
    revenueMinor: null,
    refundMinor: null,
    feeMinor: null,
    confirmReport: true,
  });
  const report = work
    .context(request("analytics", campaign.id))
    .sources.find((s) => s.id.startsWith("report:"))!;
  const model = vi
    .spyOn(app.ai, "structured")
    .mockResolvedValue({
      summary: "Measure outcomes before claiming conversion.",
      artifacts: [
        {
          kind: "analysis_brief",
          title: "A bounded measurement experiment",
          sourceIds: [report.id],
          hypotheses: [
            {
              interpretation:
                "The supplied report does not establish enrollment.",
              sourceIds: [report.id],
              experiment:
                "Tag one course landing link and inspect consented enrollment events.",
              measure: "Observed attributed enrollments where available",
              stopRule: "Review after seven days; do not infer missing values.",
            },
          ],
          missingData: ["Enrollment attribution is not connected."],
        },
      ],
      limitations: ["Manual reports are not settled sales."],
    });
  const row = await work.wait(work.start(request("analytics", campaign.id)).id);
  expect(row.phase).toBe("ready");
  expect(model.mock.calls[0][0].context).not.toContain(
    "NEVER_INCLUDE_LEARNER_CONTENT",
  );
  expect(model.mock.calls[0][0].context).toContain("manual_report");
  await work.apply(row.id, row.reviewHash!);
  expect(expansion.state().campaigns[0].revision).toBe(1);
});
it("supports atomic nested product writes and recoverable inner rollbacks", () => {
  expect(() =>
    store.transaction(() => {
      store.put("a", 1);
      store.transaction(() => store.put("b", 2));
      throw Error("rollback");
    }),
  ).toThrow();
  expect(store.get("a")).toBeUndefined();
  expect(store.get("b")).toBeUndefined();
  store.transaction(() => {
    store.put("a", 1);
    try {
      store.transaction(() => {
        store.put("b", 2);
        throw Error("inner");
      });
    } catch {}
    store.put("c", 3);
  });
  expect(store.get("a")).toBe(1);
  expect(store.get("b")).toBeUndefined();
  expect(store.get("c")).toBe(3);
  expect(() => zodSchema()).not.toThrow();
});
function zodSchema() {
  return agentWorkAnswer.toJSONSchema();
}
