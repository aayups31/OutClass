import { test, expect } from "@playwright/test";
import express from "express";
import type { Server } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Store } from "../../src/server/store";
import { Application } from "../../src/server/application";
import { createApp } from "../../src/server/http";
const base = "http://127.0.0.1:47843";
let directory: string, store: Store, server: Server;
let web: express.Express;
test.beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "outclass-features-"));
  store = new Store(path.join(directory, "data"));
  const application = new Application(store);
  await application.setup(path.join(directory, "history"), false);
  for (const id of ["python", "react"])
    application.observe({
      eventId: id,
      courseId: id,
      title:
        id === "python"
          ? "Python for useful tools"
          : "React for useful interfaces",
      url: `https://www.udemy.com/course/${id}/learn/lecture/1`,
      lessons: [
        {
          id: "1",
          title: "One useful function",
          section: "Foundations",
          order: 0,
        },
      ],
    });
  await application.start("python", "1");
  await writeFile(
    path.join(store.state().session!.workspace, "main.py"),
    "print(42)\n",
  );
  const app = (web = createApp(application, 47843));
  app.use(express.static(path.resolve("dist/web")));
  server = app.listen(47843, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
});
test.afterAll(async () => {
  await web.locals.stopPrograms();
  await new Promise<void>((r) => server.close(() => r()));
  store.close();
  await rm(directory, { recursive: true, force: true });
});
test("adjustable layout supports keyboard, pointer, persistence, focus and reset", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/?view=studio");
  await expect(
    page.getByRole("textbox", { name: "Code editor" }),
  ).toBeVisible();
  const divider = page.getByRole("separator", {
    name: "OffCourse panel width",
  });

  await divider.focus();
  await divider.press("ArrowLeft");
  await expect(divider).toHaveAttribute("aria-valuenow", "370");
  await page.getByRole("button", { name: "Show files", exact: true }).click();
  const sidebar = page.getByRole("separator", { name: "File explorer width" });
  const b = (await sidebar.boundingBox())!;
  await page.mouse.move(b.x + 3, b.y + 150);
  await page.mouse.down();
  await page.mouse.move(b.x + 43, b.y + 150);
  await page.mouse.up();
  await expect(sidebar).toHaveAttribute("aria-valuenow", "240");
  await page.reload();
  await expect(
    page.getByRole("separator", { name: "OffCourse panel width" }),
  ).toHaveAttribute("aria-valuenow", "370");
  await page.getByLabel("Layout options", { exact: true }).click();
  await page.getByRole("button", { name: "Assistant on the left" }).click();
  await page.getByLabel("Layout options", { exact: true }).click();
  await expect(page.locator(".studio")).toHaveClass(/assistant-left/);
  await page.getByRole("button", { name: "Focus editor", exact: true }).click();
  await expect(page.getByLabel("Course assistant")).toBeHidden();
  await page
    .getByRole("button", { name: "Show OffCourse", exact: true })
    .click();
  await page.getByLabel("Layout options", { exact: true }).click();
  await page.getByRole("button", { name: "Reset layout", exact: true }).click();
  await page.getByLabel("Layout options", { exact: true }).click();

  await expect(divider).toHaveAttribute("aria-valuenow", "354");
  await page.getByRole("button", { name: "Terminal", exact: true }).click();
  await expect(
    page.getByText(
      "Open the OutClass desktop application for its integrated terminal.",
      { exact: false },
    ),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({ path: ".local/design/outclass-07-studio.png" });
});
test("a delayed OffCourse answer stays with its course when switching courses", async ({
  page,
}) => {
  await page.route("**/api/library-index", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: { ...body, enabled: true } });
  });
  let finish!: (v?: unknown) => void,
    requested = false;
  await page.route("**/api/assistant-chat", async (route) => {
    requested = true;
    await new Promise((resolve) => {
      finish = resolve;
    });
    await route.fulfill({
      json: {
        messages: [
          {
            id: "private-reply",
            role: "assistant",
            text: "PYTHON_ONLY_DELAYED_REPLY",
            mode: "general",
            at: new Date().toISOString(),
          },
        ],
      },
    });
  });
  await page.goto(base + "/?view=studio");

  await page
    .getByLabel("Ask learning assistant")
    .fill("Explain this saved Python attempt.");
  await page
    .getByRole("button", { name: "Send question", exact: true })
    .click();
  await expect.poll(() => requested).toBe(true);
  await page
    .getByRole("button", { name: "Show course explorer", exact: true })
    .click();
  await page
    .getByRole("button", { name: /React for useful interfaces/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Switch course", exact: true }),
  ).toHaveText("React for useful interfaces");
  finish();
  await page.waitForResponse("**/api/assistant-chat");
  await expect(
    page.getByText("PYTHON_ONLY_DELAYED_REPLY", { exact: true }),
  ).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
});
test("original ideas, project decisions and local architect reviews work without an API key", async ({
  page,
}) => {
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto(base + "/?view=ideas");
  await page.getByRole("button", { name: "Capture my first idea" }).click();
  await page
    .getByLabel("Project title", { exact: true })
    .fill("Running club planner");
  await page
    .getByLabel("Who needs it, and what problem does it solve?")
    .fill("Our club needs a simpler way to arrange weekly runs.");
  await page
    .getByRole("checkbox", { name: "Python for useful tools", exact: true })
    .check();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page
    .getByLabel("Idea note", { exact: true })
    .fill("Ask two club members how they arrange runs today.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(
    page.getByText("Ask two club members how they arrange runs today.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Review this project", exact: true })
    .click();
  await expect(page.getByText(/Local planning checklist ·/)).toBeVisible();
  await page
    .getByLabel("Think it through with the Architect", { exact: true })
    .fill("What should I validate first?");
  await page
    .getByRole("button", { name: "Ask the Architect", exact: true })
    .click();
  await expect(
    page.getByText("Architect · local checklist", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit note", exact: true }).click();
  await page
    .getByLabel("Idea note", { exact: true })
    .fill("Interview two members before choosing a framework.");
  await page.getByRole("button", { name: "Save edit", exact: true }).click();
  await expect(
    page.getByText("Architect · local checklist", { exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByText("Interview two members before choosing a framework.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({ path: ".local/design/outclass-07-architect.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("included AI reports its pending setup honestly, local model and editor setup are usable", async ({
  page,
}) => {
  await page.goto(base + "/?view=setup");
  await page.getByRole("button", { name: "Included AI", exact: true }).click();
  await expect(
    page.getByText("Public included AI is awaiting account setup.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Email a sign-in code" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Local model", exact: true }).click();
  await page.getByLabel("Installed model name").fill("my-local-model");
  await page
    .getByRole("button", { name: "Save connection", exact: true })
    .click();
  await page.reload();
  await expect(page.getByLabel("Installed model name")).toHaveValue(
    "my-local-model",
  );
  await page.goto(base + "/?view=editors");
  await page
    .getByRole("button", { name: "Get editor connection code" })
    .click();
  await expect(page.getByLabel("Editor connection code")).toHaveText(/^\d{6}$/);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
