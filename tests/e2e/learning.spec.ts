import { test, expect } from "@playwright/test";
import express from "express";
import type { Server } from "node:http";
import { mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Store } from "../../src/server/store";
import { Application } from "../../src/server/application";
import { createApp } from "../../src/server/http";
const base = "http://127.0.0.1:47836";
let directory: string, store: Store, server: Server;
let web: express.Express;
async function startServer() {
  const application = new Application(store, "unit-only-placeholder");
  const app = (web = createApp(application, 47836));
  app.use(express.static(path.resolve("dist/web")));
  server = app.listen(47836, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return application;
}
test.beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "gitlearn-learning-browser-"));
  store = new Store(path.join(directory, "data"));
  const app = await startServer();
  await app.setup(path.join(directory, "My Learning", "history"), false);
  for (const courseId of ["javascript", "python"])
    app.observe({
      eventId: courseId,
      courseId,
      title:
        courseId === "javascript"
          ? "JavaScript projects"
          : "Python foundations",
      url: `https://www.udemy.com/course/${courseId}/learn/lecture/1`,
      currentLessonId: "1",
      lessons: [
        { id: "1", title: "Functions", section: "Basics", order: 0 },
        { id: "2", title: "Input validation", section: "Basics", order: 1 },
      ],
    });
});
test.afterAll(async () => {
  await web.locals.stopPrograms();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  store.close();
  await rm(directory, { recursive: true, force: true });
});
test("course project → actual error → hint → fix → reviewed checkpoints → restart and continue, with a second course isolated", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(base + "/?view=overview");
  await page
    .locator(".course-card")
    .filter({ hasText: "JavaScript projects" })
    .getByRole("button", { name: "Start lesson", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Start a learning session" });
  await expect(
    dialog.getByRole("radio", { name: /One project for the whole course/ }),
  ).toBeChecked();
  await dialog
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  const project = store.state().courses[0].project!;
  await page.getByRole("button", { name: "Code & learn", exact: true }).click();
  await page.getByRole("button", { name: "New file", exact: true }).click();
  await page.getByLabel("New file path").fill("main.js");
  await page
    .locator(".new-file")
    .getByRole("button", { name: "Create", exact: true })
    .click();
  const editor = page.getByRole("textbox", { name: "Code editor" });
  await editor.fill("console.log(greeting);\n");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(
    page.getByLabel("Program output", { exact: true }),
  ).toContainText("ReferenceError");
  const run = store.get<any[]>("runs:javascript")![0];
  await page
    .getByRole("button", { name: "Enable learning assistant", exact: true })
    .click();
  let requests = 0;
  await page.route("**/api/assistant-chat", async (route) => {
    const input = route.request().postDataJSON();
    expect(input.runId).toBe(run.id);
    expect(input.tutorStyle).toBe("hint");
    expect(input.mode).toBe("help");
    requests++;
    await route.fulfill({
      json: {
        messages: [
          { id: "question", role: "user", text: input.question },
          {
            id: "hint",
            role: "assistant",
            text: "Where is greeting defined before you use it? Save your change, then rerun to check.",
            mode: "general",
            sources: [],
          },
        ],
      },
    });
  });
  await page
    .getByRole("button", { name: "Give me a hint", exact: true })
    .click();
  await expect(
    page.getByText("Where is greeting defined before you use it?", {
      exact: false,
    }),
  ).toBeVisible();
  expect(requests).toBe(1);
  await editor.fill(
    "const greeting = 'Built independently'; console.log(greeting);\n",
  );
  await expect(page.locator(".run-evidence-note")).toContainText(
    "Code changed",
  );
  await page.screenshot({
    path: ".local/design/learning-stage-a-dark.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(
    page.getByLabel("Program output", { exact: true }),
  ).toContainText("Built independently");
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page
    .getByLabel("Studio session notes")
    .fill("Next: add input validation, starting from my own greeting.");
  await expect(page.locator(".studio-notes summary")).toContainText(
    "Note saved",
  );
  await page.getByRole("button", { name: "Checkpoint", exact: true }).click();
  await page
    .getByRole("button", { name: "Save checkpoint", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("button", { name: "Start lesson", exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Lesson", { exact: true }).selectOption("2");
  await dialog
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(editor).toContainText("Built independently");
  expect(store.state().session!.workspace).toBe(project.root);
  await editor.fill(
    "const validate = name => typeof name === 'string'; console.log(validate('GitLearn'));\n",
  );
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(
    page.getByLabel("Program output", { exact: true }),
  ).toContainText("true");
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page
    .getByLabel("Studio session notes")
    .fill("Next: reject an empty name.");
  await expect(page.locator(".studio-notes summary")).toContainText(
    "Note saved",
  );
  await page.getByRole("button", { name: "Checkpoint", exact: true }).click();
  await page
    .getByRole("button", { name: "Save checkpoint", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.goto("about:blank");
  await web.locals.stopPrograms();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  store.close();
  store = new Store(path.join(directory, "data"));
  await startServer();
  await page.goto(base + "/?view=overview");
  const continuation = page.getByRole("region", { name: "Continue learning" });
  await expect(continuation).toContainText("Next: reject an empty name.");
  await continuation
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  await expect(editor).toContainText("const validate");
  await page
    .locator(".studio-dock-tabs")
    .getByRole("button", { name: "Output", exact: true })
    .click();
  await expect(
    page.getByLabel("Program output", { exact: true }),
  ).toContainText("true");
  expect(store.state().session!.lessonId).toBe("2");
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  const movedRoot = project.root + "-moved";
  await rename(project.root, movedRoot);
  await expect(continuation).toContainText("Coding folder is missing", {
    timeout: 15000,
  });
  await continuation
    .getByRole("button", { name: "Choose folder", exact: true })
    .click();
  const recovery = page.getByRole("dialog", {
    name: "Find your coding folder",
  });
  await recovery.getByLabel("Current coding folder").fill(movedRoot);
  await recovery.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(recovery).toBeHidden();
  await expect(editor).toContainText("const validate");
  expect(store.state().session!.note).toBe("Next: reject an empty name.");
  project.root = movedRoot;
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "End without saving", exact: true })
    .click();
  await page
    .locator(".course-card")
    .filter({ hasText: "Python foundations" })
    .getByRole("button", { name: "Start lesson", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  expect(store.state().session!.workspace).not.toBe(project.root);
  expect(await readFile(path.join(project.root, "main.js"), "utf8")).toContain(
    "const validate",
  );
  await page
    .getByRole("button", { name: "Setup & preferences", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Device readiness" }),
  ).toContainText("Available and writable");
  await page.screenshot({
    path: ".local/design/learning-stage-a-readiness.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
