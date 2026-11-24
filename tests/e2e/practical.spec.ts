import { test, expect } from "@playwright/test";
import express from "express";
import type { Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Store } from "../../src/server/store";
import { Application } from "../../src/server/application";
import { Workspace } from "../../src/server/workspace";
import { createApp } from "../../src/server/http";
const base = "http://127.0.0.1:47837";
let folder: string,
  store: Store,
  server: Server,
  web: ReturnType<typeof createApp>;
test.beforeAll(async () => {
  folder = await mkdtemp(path.join(tmpdir(), "gitlearn-practical-ui-"));
  store = new Store(path.join(folder, "data"));
  const app = new Application(store);
  await app.setup(path.join(folder, "Learning", "history"), false);
  app.observe({
    eventId: "js",
    courseId: "js",
    title: "JavaScript from first principles",
    url: "https://www.udemy.com/course/js/learn/lecture/1",
    currentLessonId: "1",
    lessons: [
      {
        id: "1",
        title: "Functions and validation",
        section: "Foundations",
        order: 0,
      },
    ],
  });
  await app.bindProject("js", "project");
  await app.start("js", "1");
  const w = new Workspace(app),
    id = store.state().session!.id;
  await w.save(id, "main.js", "console.log('Ready for practical work');", null);
  await w.run(id, "main.js");
  web = createApp(app, 47837);
  web.use(express.static(path.resolve("dist/web")));
  server = web.listen(47837, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
});
test.afterAll(async () => {
  await web.locals.stopPrograms();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  store.close();
  await rm(folder, { recursive: true, force: true });
});
test("a during-course suggestion becomes learner-written work, real checks, hints, reflection, and a fresh review", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(base + "/?view=overview");
  await expect(page.getByLabel("Practical learning opportunity")).toContainText(
    "useful moment",
  );
  await page.getByRole("button", { name: "Explore task", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Learn by doing." }),
  ).toBeVisible();
  await page
    .locator(".learning-row")
    .filter({ hasText: "Build a price calculator" })
    .filter({ hasText: "javascript" })
    .getByRole("button", { name: "Start", exact: true })
    .click();
  await page
    .locator(".layout-tools")
    .getByRole("button", { name: "Lesson", exact: true })
    .click();
  await expect(page.locator(".task-guide > summary")).toContainText(
    "price calculator",
  );
  await page
    .getByRole("button", { name: "Check my work", exact: true })
    .click();
  await expect(page.locator(".inline-checks")).toContainText(
    "No discount preserves",
  );
  expect(store.get<any[]>("practice:tasks")![0].attempts[0].passed).toBe(false);
  await page.getByRole("button", { name: "Next hint", exact: true }).click();
  await expect(page.locator(".guided-hint")).toContainText("invalid inputs");
  const editor = page.getByRole("textbox", { name: "Code editor" });
  await editor.fill(
    "export function discountedPrice(price, discount) { if (price < 0 || discount < 0 || discount > 100) throw Error('Invalid'); return Math.round(price * (1-discount/100) * 100)/100; }\n",
  );
  await page
    .getByRole("button", { name: "Check my work", exact: true })
    .click();
  await expect(page.locator(".task-guide > summary")).toContainText(
    "Checks passed",
  );
  await page.locator(".workspace-more > summary").click();
  await page
    .getByRole("button", { name: "Learn by doing", exact: true })
    .click();
  await page.locator(".task-row").first().click();
  await page
    .getByRole("textbox", { name: "Explain your approach" })
    .fill("I validate inputs before calculating; rounding belongs at the end.");
  await page
    .getByRole("button", { name: "Save reflection", exact: true })
    .click();
  await page.getByRole("tab", { name: "Reviews", exact: true }).click();
  await expect(page.locator(".skill-record")).toContainText(
    "with OutClass help",
  );
  await page.getByLabel("Search my learning").fill("validation");
  await page
    .getByRole("button", { name: "Search my learning", exact: true })
    .click();
  await page.locator(".memory-result summary").first().click();
  await expect(page.locator(".memory-result").first()).toContainText(
    "rounding belongs at the end",
  );
  await page.screenshot({
    path: ".local/design/practical-reviews-dark.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".task-guide > summary")).toContainText(
    "practical task",
  );
  expect(store.get<any[]>("practice:tasks")).toHaveLength(2);
  await page.getByRole("button", { name: "Project", exact: true }).click();
  await page.getByLabel("Project command").fill("node --version");
  await page.getByRole("button", { name: "Run command", exact: true }).click();
  await expect(page.getByLabel("Project command output")).toContainText(/v\d+/);
  await page.getByLabel("Project technology").selectOption("react");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page.locator(".project-console-content")).toContainText(
    "Created apps/react-",
  );
  await page.screenshot({
    path: ".local/design/practical-workspace-dark.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("live work displays a checked shortlist and sourced brief without creating public writes", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  const candidate = {
    repo: "example/learning",
    number: 4,
    title: "Validate empty inputs",
    url: "https://github.com/example/learning/issues/4",
    body: "Add a regression test for empty input.",
    language: "JavaScript",
    license: "MIT",
    checkedAt: new Date().toISOString(),
    signals: ["Marked as welcoming help"],
    cautions: ["Read contributor rules and AI-use policies."],
    sources: [
      {
        title: "CONTRIBUTING.md",
        url: "https://github.com/example/learning/blob/main/CONTRIBUTING.md",
        text: "Run the baseline tests before changes.",
        revision: "abc123",
      },
    ],
  };
  const record = {
    id: "00000000-0000-4000-8000-000000000004",
    courseId: "js",
    candidate,
    notes: "",
    stages: [],
    createdAt: new Date().toISOString(),
  };
  await page.route("**/api/live-search", (route) =>
    route.fulfill({
      json: {
        contributions: [],
        shortlist: [candidate],
        lastSearch: {
          at: new Date().toISOString(),
          rationale: "Chosen language and demonstrated practical attempts.",
        },
      },
    }),
  );
  let selected = false;
  await page.route("**/api/live-select", (route) => {
    selected = true;
    return route.fulfill({ json: record });
  });
  await page.route("**/api/live-work", (route) =>
    route.fulfill({
      json: {
        contributions: selected ? [record] : [],
        shortlist: selected ? [candidate] : [],
        lastSearch: {
          at: new Date().toISOString(),
          rationale: "Chosen language and recorded practical attempts.",
        },
      },
    }),
  );
  await page.goto(base + "/?view=live");
  await page
    .getByRole("button", { name: "Find opportunities", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Inspect & plan", exact: true })
    .click();
  await expect(page.locator(".learning-detail")).toContainText(
    "Validate empty inputs",
  );
  await page.getByText("CONTRIBUTING.md", { exact: true }).click();
  await expect(page.locator(".contributor-source")).toContainText(
    "baseline tests",
  );
  await expect(
    page.getByRole("button", { name: "Clone & open workspace" }),
  ).toBeVisible();
  expect(store.get<any[]>("live:contributions") || []).toHaveLength(0);
  await page.screenshot({
    path: ".local/design/live-work-dark.png",
    fullPage: true,
  });
});
