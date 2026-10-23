import { test, expect } from "@playwright/test";
import express from "express";
import type { Server } from "node:http";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Store } from "../../src/server/store";
import { Application } from "../../src/server/application";
import { Workspace } from "../../src/server/workspace";
import { createApp } from "../../src/server/http";
import { nativeCompiler } from "../../src/server/native-runtime";
let directory: string,
  source: string,
  store: Store,
  server: Server,
  web: ReturnType<typeof createApp>;
const base = "http://127.0.0.1:47840";
test.beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "outclass-language-ui-"));
  store = new Store(path.join(directory, "data"));
  const app = new Application(store);
  await app.setup(path.join(directory, "history"), false);
  app.observe({
    eventId: "language",
    courseId: "typescript",
    title: "TypeScript foundations",
    url: "https://www.udemy.com/course/typescript/learn/lecture/1",
    lessons: [
      { id: "1", title: "Typed functions", section: "Basics", order: 0 },
    ],
  });
  await app.bindProject("typescript", "project");
  await app.start("typescript", "1");
  source = store.state().session!.workspace;
  await new Workspace(app).save(
    store.state().session!.id,
    "main.ts",
    'const message: string = "TypeScript works"; console.log(message);',
    null,
  );
  web = createApp(app, 47840);
  web.use(express.static(path.resolve("dist/web")));
  server = web.listen(47840, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
});
test.afterAll(async () => {
  await web.locals.stopPrograms();
  await new Promise<void>((r) => server.close(() => r()));
  store.close();
  await rm(directory, { recursive: true, force: true });
});
test("language-aware studio creates React/Next/Python/native projects and runs TypeScript through the UI", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(base + "/?view=studio");
  await expect(
    page.getByRole("textbox", { name: "Code editor" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(
    page.getByLabel("Program output", { exact: true }),
  ).toContainText("TypeScript works");
  await page.getByRole("button", { name: "Project", exact: true }).click();
  for (const kind of ["react-ts", "next", "python", "cpp"]) {
    await page.getByLabel("Project technology").selectOption(kind);
    if (kind === "python")
      await page.getByLabel("Python packages").selectOption("data");
    await page
      .getByRole("button", { name: "Create project", exact: true })
      .click();
    await expect(page.locator(".project-console [role=status]")).toContainText(
      `apps/${kind}-`,
    );
    if (kind === "next")
      await expect(page.getByLabel("Local application port")).toHaveValue(
        "3000",
      );
    const created = await page
      .locator(".project-console [role=status]")
      .textContent();
    const folder = created!.match(/apps\/[\w-]+/)![0];
    if (kind === "python") {
      expect(
        await readFile(path.join(source, folder, "requirements.txt"), "utf8"),
      ).toContain("pandas");
      await page
        .getByRole("button", { name: "Install packages", exact: true })
        .click();
      await expect(page.getByLabel("Project command")).toHaveValue(
        `python -m pip install -r ${folder}/requirements.txt`,
      );
    }
    if (kind === "cpp" && (await nativeCompiler(true))) {
      await page
        .getByRole("button", { name: "Show files", exact: true })
        .click();
      await page
        .locator(`.file-explorer button[title="${folder}/main.cpp"]`)
        .click();
      await page.getByRole("button", { name: "Run", exact: true }).click();
      await expect(
        page.getByLabel("Program output", { exact: true }),
      ).toContainText("My learning project", { timeout: 15000 });
    }
  }
  await page.screenshot({
    path: ".local/design/language-projects-dark.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/design/language-projects-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator(".workspace-more > summary").click();
  await page
    .getByRole("button", { name: "Learn by doing", exact: true })
    .click();
  await page.getByLabel("Practice language").selectOption("cpp");
  await expect(page.locator(".learning-list")).toContainText(
    "Build a native price calculator",
  );
  expect(errors).toEqual([]);
});
