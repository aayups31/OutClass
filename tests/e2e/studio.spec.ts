import { test, expect } from "@playwright/test";
import express from "express";
import type { Server } from "node:http";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Store } from "../../src/server/store";
import { Application } from "../../src/server/application";
import { createApp } from "../../src/server/http";
const base = "http://127.0.0.1:47835";
let directory: string, source: string, store: Store, server: Server;
let web: express.Express;
test.beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "gitlearn-studio-browser-"));
  store = new Store(path.join(directory, "data"));
  const application = new Application(store);
  await application.setup(path.join(directory, "history"), false);
  application.observe({
    eventId: "studio",
    courseId: "ai-engineer",
    title: "AI Engineer · Agents & tools",
    url: "https://www.udemy.com/course/ai-engineer/learn/lecture/7",
    currentLessonId: "7",
    lessons: [
      {
        id: "7",
        title: "Building your first agent",
        section: "Agents & tools",
        order: 0,
      },
      {
        id: "8",
        title: "Retrieval and memory",
        section: "Course knowledge",
        order: 1,
      },
    ],
  });
  await application.mirror("ai-engineer");
  await application.start("ai-engineer", "7");
  source = store.state().session!.workspace;
  await writeFile(
    path.join(source, "main.js"),
    "// One small step at a time.\nfunction greet(name) {\n  return `Hello, ${name}`;\n}\n\nconsole.log(greet('GitLearn'));\n",
  );
  const app = (web = createApp(application, 47835));
  app.use((_req, res, next) => {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'",
    );
    next();
  });
  app.use(express.static(path.resolve("dist/web")));
  server = app.listen(47835, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
});
test.afterAll(async () => {
  await web.locals.stopPrograms();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  store.close();
  await rm(directory, { recursive: true, force: true });
});
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "wait" });
});

test("editor-first layout keeps tools optional, restores focus and preserves drafts", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.emulateMedia({ colorScheme: "dark" });
  // Migrate old panel sizes without reopening the previously crowded layout.
  await page.addInitScript(() =>
    localStorage.setItem(
      "outclass-layout-v1",
      JSON.stringify({ assistant: 370, hideAssistant: false }),
    ),
  );
  await page.goto(base + "/?view=studio");
  const editor = page.getByRole("textbox", { name: "Code editor" });
  const surface = page.locator(".code-editor");
  await expect(editor).toBeVisible();
  await expect(
    page.getByLabel("Course assistant", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".studio-bottom")).toBeHidden();
  await expect(
    page.getByLabel("Integrated terminal", { exact: true }),
  ).toBeHidden();
  const initial = (await surface.boundingBox())!;
  expect(initial.width).toBeGreaterThan(1366 * 0.65);
  expect(initial.height).toBeGreaterThan(768 * 0.8);
  await page.screenshot({ path: ".local/design/studio-minimal-laptop.png" });
  await editor.fill(
    "// Keep my unfinished idea\nconsole.log('A focused workspace');",
  );
  await page
    .locator(".layout-tools")
    .getByRole("button", { name: "Lesson", exact: true })
    .click();
  await expect(page.locator(".lesson-panel")).toBeVisible();
  await expect(editor).toContainText("Keep my unfinished idea");
  await page.getByRole("button", { name: "Focus editor", exact: true }).click();
  await expect(page.locator(".sidebar")).toBeHidden();
  await expect(page.locator(".file-explorer")).toBeHidden();
  await expect(
    page.getByLabel("Course assistant", { exact: true }),
  ).toBeHidden();
  expect((await surface.boundingBox())!.width).toBeGreaterThan(1366 * 0.95);
  expect((await surface.boundingBox())!.height).toBeGreaterThan(768 * 0.8);
  await page.screenshot({ path: ".local/design/studio-minimal-focus.png" });
  await page.getByRole("button", { name: "Exit focus mode" }).click();
  await expect(page.locator(".lesson-panel")).toBeVisible();
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect(editor).toContainText("Keep my unfinished idea");
  await page.getByRole("button", { name: "Close assistant panel" }).click();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(page.getByLabel("Studio session notes")).toBeVisible();
  await page.getByRole("separator", { name: "Bottom panel height" }).focus();
  await page.keyboard.press("ArrowUp");
  await expect(
    page.getByRole("separator", { name: "Bottom panel height" }),
  ).toHaveAttribute("aria-valuenow", "236");
  await page.getByRole("button", { name: "Project", exact: true }).click();
  await expect(page.getByLabel("Studio session notes")).toBeHidden();
  await expect(page.getByLabel("Project technology")).toBeVisible();
  await page.getByRole("button", { name: "Terminal", exact: true }).click();
  await expect(page.getByLabel("Project technology")).toBeHidden();
  await expect(
    page.getByLabel("Integrated terminal", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close bottom panel" }).click();
  await expect(
    page.getByLabel("Integrated terminal", { exact: true }),
  ).toBeHidden();
  await expect(editor).toContainText("Keep my unfinished idea");
  await page.reload();
  await expect(
    page.getByLabel("Course assistant", { exact: true }),
  ).toBeHidden();
  await expect(page.locator(".studio-bottom")).toBeHidden();
  await page.locator(".workspace-more > summary").click();
  await expect(
    page.getByRole("button", { name: "Academy", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Creator Studio", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "GTM", exact: true }),
  ).toBeVisible();
  await page.locator(".workspace-more > summary").click();
  for (const width of [1000, 768, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(editor).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Assistant", exact: true }).click();
    await expect(
      page.getByLabel("Course assistant", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close assistant panel" }).click();
    await expect(editor).toBeVisible();
  }
  await page.screenshot({ path: ".local/design/studio-minimal-mobile.png" });
});
test("local studio edits, runs, preserves external edits, imports course material, cites passages, and checkpoints", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base + "/?view=studio");
  const editor = page.getByRole("textbox", { name: "Code editor" });
  await expect(editor).toBeVisible();
  await editor.fill("console.log('Local studio result', 21 * 2);\n");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect
    .poll(() => readFile(path.join(source, "main.js"), "utf8"))
    .toContain("21 * 2");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(
    page.getByLabel("Program output", { exact: true }),
  ).toContainText("Local studio result 42");
  await writeFile(
    path.join(source, "main.js"),
    "console.log('External edit preserved');\n",
  );
  await editor.fill("console.log('An older draft');\n");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("changed on disk");
  expect(await readFile(path.join(source, "main.js"), "utf8")).toContain(
    "External edit preserved",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Reload current file from disk" })
    .click();
  await expect(editor).toContainText("External edit preserved");
  await page.getByRole("button", { name: "Sources", exact: false }).click();
  await page.getByRole("button", { name: "Add material", exact: true }).click();
  await page.getByLabel("Source title").fill("Lesson 7 · Tool descriptions");
  await page
    .getByLabel("Course source text")
    .fill(
      "A tool is a callable function. Give each tool a clear description so the agent knows when to use it. Keep a tool focused on one responsibility.",
    );
  await page.getByRole("button", { name: "Save source locally" }).click();
  await expect(page.locator(".source-list")).toContainText(
    "Lesson 7 · Tool descriptions",
  );
  await page.route("**/api/library-index", async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    await route.fulfill({ json: { ...json, enabled: true, hasApiKey: true } });
  });
  await page.route("**/api/library?*", async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    await route.fulfill({ json: { ...json, enabled: true, hasApiKey: true } });
  });
  await page.route("**/api/assistant-chat", (route) =>
    route.fulfill({
      json: {
        messages: [
          {
            id: "q",
            role: "user",
            text: "How should I describe a tool?",
            at: "2026-10-10",
          },
          {
            id: "a",
            role: "assistant",
            text: "Give each tool a **clear description** and one responsibility [1].\n\n```javascript\nconsole.log('One focused tool');\n```",
            mode: "grounded",
            sources: [
              {
                id: "source:0",
                number: 1,
                title: "Lesson 7 · Tool descriptions",
                text: "A tool is a callable function. Give each tool a clear description so the agent knows when to use it.",
                kind: "transcript",
                lessonId: "7",
                startLine: 1,
                endLine: 1,
              },
            ],
            at: "2026-10-10",
          },
        ],
      },
    }),
  );
  await page.reload();
  await editor.fill(
    "// A tool does one thing well.\nconst tools = [\n  {\n    name: 'multiply',\n    description: 'Multiply two numbers and return the result.',\n    execute: ({ a, b }) => a * b,\n  },\n];\n\nfunction useTool(name, inputs) {\n  const tool = tools.find(tool => tool.name === name);\n  if (!tool) throw new Error(`Unknown tool: ${name}`);\n  return tool.execute(inputs);\n}\n\nconst result = useTool('multiply', { a: 6, b: 7 });\nconsole.log('Tool result:', result);\n",
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(
    page.getByLabel("Program output", { exact: true }),
  ).toContainText("Tool result: 42");
  await page
    .getByRole("button", { name: "Ask the course", exact: true })
    .click();
  await page
    .getByLabel("Ask learning assistant")
    .fill("How should I describe a tool?");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.locator(".chat-message.assistant")).toContainText(
    "one responsibility",
  );
  await expect(page.locator(".chat-message.assistant strong")).toHaveText(
    "clear description",
  );
  await expect(page.locator(".assistant-thinking")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/studio-dark.png",
    animations: "disabled",
  });
  await page.locator(".answer-sources").getByRole("button").click();
  await expect(page.locator(".evidence-view")).toContainText("Lines 1–1");
  await page.getByRole("button", { name: "Close source passage" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  await expect(page.getByLabel("Ask learning assistant")).toBeVisible();
  await page.screenshot({ path: "test-results/studio-mobile.png" });
  await page.getByRole("button", { name: "Code", exact: true }).click();
  await expect(editor).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel("Layout options", { exact: true }).click();
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await page.getByLabel("Layout options", { exact: true }).click();
  await page.screenshot({
    path: "test-results/studio-light.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "New file", exact: true }).click();
  await page.getByLabel("New file path").fill("index.html");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(editor).toContainText("My lesson");
  await editor.fill(
    "<!doctype html><h1>Preview loading</h1><script>document.querySelector('h1').textContent='Local preview works';</script>",
  );
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    page
      .frameLocator('iframe[title="Local HTML preview"]')
      .getByText("Local preview works"),
  ).toBeVisible();
  const previewFrame = page
    .frames()
    .find((frame) => frame.url().includes("/preview/"))!;
  expect(
    await previewFrame.evaluate(async () => {
      try {
        await fetch("/api/state");
        return true;
      } catch {
        return false;
      }
    }),
  ).toBe(false);
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page
    .getByLabel("Studio session notes")
    .fill("I practiced one focused tool and ran the saved code locally.");
  await expect(page.locator(".studio-notes summary")).toContainText(
    "Note saved",
  );
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.locator("#session-note")).toHaveValue(
    "I practiced one focused tool and ran the saved code locally.",
  );
  await page.getByRole("button", { name: "Code & learn", exact: true }).click();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(page.getByLabel("Studio session notes")).toHaveValue(
    "I practiced one focused tool and ran the saved code locally.",
  );
  await page.getByRole("button", { name: "Checkpoint", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Review your checkpoint" }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".file-list")).toContainText("main.js");
  await page
    .getByRole("button", { name: "Save checkpoint", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(errors).toEqual([]);
});
