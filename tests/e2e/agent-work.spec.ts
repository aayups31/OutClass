import { test, expect } from "@playwright/test";
import express from "express";
import type { Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Store } from "../../src/server/store";
import { Application } from "../../src/server/application";
import { Expansion } from "../../src/server/expansion";
import { createApp } from "../../src/server/http";
const base = "http://127.0.0.1:47849";
let directory: string,
  store: Store,
  server: Server,
  web: ReturnType<typeof createApp>,
  expansion: Expansion;
test.beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "outclass-work-browser-"));
  store = new Store(path.join(directory, "data"));
  const app = new Application(store, "synthetic-model-fixture");
  await app.setup(path.join(directory, "history"), false);
  expansion = new Expansion(app);
  const c = expansion.saveCourse({
    title: "Python activity reports",
    audience: "Learners who know loops",
    outcome: "Build a grouped report",
    rightsConfirmed: true,
    expectedRevision: 0,
    lessons: [
      {
        title: "Accumulate records",
        objective: "Group records by person",
        practice: "Handle repeated people",
        content: "A dictionary stores a running total for each person.",
      },
    ],
  });
  const release = expansion.release(c.id, {
    expectedRevision: 1,
    approve: true,
  });
  const creative = expansion.saveCreative({
    title: "A useful activity report",
    releaseId: release.id,
    lessonIndex: 0,
    brief: "Demonstrate the grouping concept",
    copy: "Build a grouped report from real input.",
    brandColor: "#386bfa",
    rightsConfirmed: true,
    expectedRevision: 0,
  });
  expansion.approveCreative(creative.id, {
    expectedRevision: 1,
    approve: true,
  });
  expansion.saveCampaign({
    title: "Practical Python launch",
    creativeId: creative.id,
    destination: "https://example.com/python",
    source: "linkedin",
    medium: "organic",
    goal: "Reach beginner Python learners",
    budgetMinor: 0,
    currency: "CAD",
    expectedRevision: 0,
  });
  app.ai.structured = (async (options: any) => {
    const input = JSON.parse(options.context),
      sourceIds = ["lesson:0"];
    const artifacts =
      input.domain === "academy"
        ? [
            {
              kind: "lesson_package",
              title: "Write a grouping report",
              sourceIds,
              lessonIndex: 0,
              objective: "Demonstrate grouping records by person",
              practice:
                "Group repeated people and validate the empty collection.",
              minutes: 20,
              prerequisiteLessons: [],
              acceptanceCriteria: [
                "Each person has one accumulated total.",
                "An empty collection gives an empty report.",
              ],
              hints: [
                "Identify the grouping key first.",
                "Trace a repeated person before updating the total.",
              ],
              reflection:
                "Which example proved that repeated people are combined?",
              transferChallenge: "Allow choosing a different grouping field.",
            },
          ]
        : input.domain === "creative"
          ? [
              {
                kind: "production_script",
                title: "A report worth building",
                sourceIds,
                format: "landscape",
                assetId: null,
                scenes: [
                  {
                    narration:
                      "Begin with repeated people in a small activity list.",
                    caption: "Repeated records",
                    sourceIds,
                    start: null,
                    end: null,
                  },
                  {
                    narration:
                      "Trace the grouping update and try your own report.",
                    caption: "Make the concept useful",
                    sourceIds,
                    start: null,
                    end: null,
                  },
                ],
              },
            ]
          : input.domain === "growth"
            ? input.requestedProviders.map((provider: string) => ({
                kind: "channel_post",
                title: `${provider}: useful Python reports`,
                sourceIds,
                provider,
                text: `${provider}: What happens when the same person appears twice? Trace the records, then build your own activity report.`,
                caption: "Practice a real grouping problem",
              }))
            : [
                {
                  kind: "analysis_brief",
                  title: "Measure the learning funnel",
                  sourceIds,
                  hypotheses: [
                    {
                      interpretation:
                        "Course material alone does not establish audience demand.",
                      sourceIds,
                      experiment:
                        "Share one source-grounded preview and collect consented engagement.",
                      measure: "Observed channel clicks where available",
                      stopRule:
                        "Review after one week; do not infer enrollment.",
                    },
                  ],
                  missingData: [
                    "Verified channel observations are not connected.",
                  ],
                },
              ];
    return {
      summary: "Concrete work grounded in the selected lesson.",
      artifacts,
      limitations: [
        "Review the output; structural checks do not certify editorial quality or learner outcomes.",
      ],
    };
  }) as typeof app.ai.structured;
  web = createApp(app, 47849);
  web.use(express.static(path.resolve("dist/web")));
  server = web.listen(47849, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
});
test.afterAll(async () => {
  await web.locals.stopPrograms();
  await new Promise<void>((r) => server.close(() => r()));
  store.close();
  await rm(directory, { recursive: true, force: true });
});
test("the four specialists produce, review, deliver and restore actual product artifacts", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(base + "/?view=academy");
  await page
    .locator(".product-drafts")
    .getByRole("button", { name: /Python activity reports/ })
    .click();
  const academy = page.getByRole("region", {
    name: "Academy Architect task workspace",
  });
  await academy.getByRole("button", { name: "Run agent", exact: true }).click();
  await expect(
    academy.getByText("Ready for review", { exact: true }),
  ).toBeVisible();
  await expect(academy).toContainText(
    "An empty collection gives an empty report.",
  );
  await academy
    .getByRole("button", { name: "Apply assignment to course" })
    .click();
  await expect(academy.getByText("Delivered", { exact: true })).toBeVisible();
  expect(expansion.state().courses[0].revision).toBe(2);
  await page.screenshot({
    path: ".local/design/academy-agent-work.png",
    fullPage: true,
  });
  await page.reload();
  await page
    .locator(".product-drafts")
    .getByRole("button", { name: /Python activity reports/ })
    .click();
  await expect(academy.getByText("Delivered", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Creator Studio", exact: true })
    .click();
  await page
    .locator(".product-drafts")
    .getByRole("button", { name: /A useful activity report/ })
    .click();
  const creative = page.getByRole("region", {
    name: "Creative Director task workspace",
  });
  await creative
    .getByRole("button", { name: "Run agent", exact: true })
    .click();
  await expect(
    creative.getByText("Ready for review", { exact: true }),
  ).toBeVisible();
  await expect(creative).toContainText("Script · footage not selected");
  await creative
    .getByRole("button", { name: "Save script & timeline" })
    .click();
  await expect(creative.getByText("Delivered", { exact: true })).toBeVisible();
  expect(expansion.state().creatives[0].copy).toContain(
    "Trace the grouping update",
  );
  expect(expansion.state().creatives[0].approval).toBeUndefined();
  await page.getByRole("button", { name: "GTM", exact: true }).click();
  await page
    .getByRole("button", { name: "Campaigns & insights", exact: true })
    .click();
  await page
    .locator(".product-drafts")
    .getByRole("button", { name: /Practical Python launch/ })
    .click();
  const growth = page.getByRole("region", {
    name: "Growth Strategist task workspace",
  });
  await growth.getByRole("button", { name: "Run agent", exact: true }).click();
  await expect(
    growth.getByText("Ready for review", { exact: true }),
  ).toBeVisible();
  await expect(growth.locator(".agent-work-artifact")).toHaveCount(4);
  await growth
    .getByRole("button", { name: "Prepare channel campaigns" })
    .click();
  await expect(growth.getByText("Delivered", { exact: true })).toBeVisible();
  expect(expansion.state().campaigns).toHaveLength(5);
  expect(store.get("gtm:publication:v1") || []).toEqual([]);
  const analytics = page.getByRole("region", {
    name: "Analytics task workspace",
  });
  await analytics
    .getByRole("button", { name: "Run agent", exact: true })
    .click();
  await expect(
    analytics.getByText("Ready for review", { exact: true }),
  ).toBeVisible();
  await expect(analytics).toContainText("Interpretations to investigate");
  await analytics.getByRole("button", { name: "Save evidence brief" }).click();
  await expect(analytics.getByText("Delivered", { exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await analytics
    .getByRole("button", { name: "Export task, deliverables & evidence" })
    .click();
  expect((await download).suggestedFilename()).toMatch(/^outclass-task-/);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
