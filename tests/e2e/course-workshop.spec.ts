import { test, expect } from "@playwright/test";
import express from "express";
import type { Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Store } from "../../src/server/store";
import { Application } from "../../src/server/application";
import { createApp } from "../../src/server/http";
import { CourseSandbox } from "../../src/server/course-sandbox";
import {
  workshopBrief,
  workshopPlan,
  writtenLesson,
} from "../helpers/course-workshop";
let dir: string,
  store: Store,
  server: Server,
  web: ReturnType<typeof createApp>;
const base = "http://127.0.0.1:47853";
const originalVerify = CourseSandbox.prototype.verify;
test.beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "outclass-course-browser-"));
  store = new Store(path.join(dir, "data"));
  const app = new Application(store, "fixture-key");
  await app.setup(path.join(dir, "history"), false);
  app.ai.structured = (async (options) =>
    options.task === "course_plan"
      ? structuredClone(workshopPlan)
      : options.task === "course_lesson"
        ? writtenLesson(JSON.parse(options.context).index)
        : {
            findings: [],
            limitations: [
              "Fixture workflow verification; no real provider was called.",
            ],
          }) as typeof app.ai.structured;
  CourseSandbox.prototype.verify = async () => ({
    hash: "a".repeat(64),
    verified: true,
    image: "browser-fixture@sha256:" + "b".repeat(64),
    at: new Date().toISOString(),
    checks: [
      {
        candidate: "reference",
        code: 0,
        tests: 2,
        output:
          "Controlled browser workflow fixture; isolated runtime is verified separately.",
      },
    ],
  });
  web = createApp(app, 47853);
  web.use(express.static(path.resolve("dist/web")));
  server = web.listen(47853, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
});
test.afterAll(async () => {
  CourseSandbox.prototype.verify = originalVerify;
  await web.locals.stopPrograms();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  store.close();
  await rm(dir, { recursive: true, force: true });
});
test("builds a complete course through the workshop and delivers private-key-backed practice into Learn", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base + "/?view=academy");
  await page.getByRole("button", { name: "Atlas", exact: true }).click();
  await page
    .getByRole("button", { name: "Full course workshop", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "Full course workshop" });
  await panel.getByText("Scope and tooling", { exact: true }).click();
  for (const key of [
    "title",
    "audience",
    "outcome",
    "deliverable",
    "constraints",
    "exclusions",
    "runtime",
  ] as const)
    await page
      .getByLabel(`Workshop ${key}`, { exact: true })
      .fill(workshopBrief[key]);
  await page
    .getByLabel("Starting skills · one per line")
    .fill("functions\nloops");
  await page.getByLabel("Number of lessons", { exact: true }).fill("3");
  await page.getByLabel("Course hours", { exact: true }).fill("4");
  await page.getByLabel(/I approve up to 11 provider calls/).check();
  await page
    .getByRole("button", { name: "Save course brief", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Generate course plan", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Accept course plan", exact: true })
    .click();
  for (let step = 0; step < 6; step++)
    await page
      .getByRole("button", { name: "Generate next stage", exact: true })
      .click();
  await expect(
    page.getByRole("heading", { name: "Independent editorial review" }),
  ).toBeVisible();
  for (const lesson of workshopPlan.lessons) {
    await page
      .getByRole("button", {
        name: `${lesson.module} · ${lesson.title}`,
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name: "Verify starter, reference and deliberate mistake",
        exact: true,
      })
      .click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "The supplied tests pass the reference" }),
    ).toBeVisible();
  }
  await page
    .getByLabel(
      "I reviewed the lessons, source evidence, private assessment keys and critique.",
    )
    .check();
  await page
    .getByRole("button", { name: "Create instructor draft", exact: true })
    .click();
  await page
    .getByLabel("Academy course", { exact: true })
    .selectOption({ label: workshopBrief.title });
  await page
    .getByRole("button", { name: "Course overview", exact: true })
    .click();
  await page.getByLabel("I own or have permission").check();
  await page
    .getByRole("button", { name: "Save course draft", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review & release", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Complete instructor review", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Approve local release", exact: true })
    .click();
  await page.getByLabel(/Preview lesson revision/).selectOption("0");
  await page
    .getByRole("button", { name: "Preview as a learner", exact: true })
    .click();
  await expect(page.locator(".topbar")).toContainText("Code & learn");
  await page
    .locator(".layout-tools")
    .getByRole("button", { name: "Lesson", exact: true })
    .click();
  await expect(
    page.getByText("Practice questions & cumulative review", { exact: true }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "8", exact: true }).check();
  await page
    .getByRole("button", { name: "Check response", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Correct for this item" }),
  ).toBeVisible();
  const course = store.get<any>("expansion:v1").courses[0];
  expect(JSON.stringify(course)).not.toContain("correctChoice");
  expect(errors).toEqual([]);
});
