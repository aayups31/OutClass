import { test, expect, chromium } from "@playwright/test";
import {
  mkdir,
  writeFile,
  mkdtemp,
  readFile,
  cp,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("first-time setup → Udemy lesson → source code → reviewed local checkpoint", async ({
  page,
  request,
  baseURL,
}) => {
  const source = await mkdtemp(path.join(tmpdir(), "gitlearn-browser-source-"));
  const repo = await mkdtemp(path.join(tmpdir(), "gitlearn-browser-history-"));
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Keep what you learn." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/onboarding.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Switch to light mode" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Keep what you learn." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/onboarding-dark.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/onboarding-dark-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Set up my workspace" }).click();
  await page.screenshot({ path: "test-results/setup.png", fullPage: true });
  await page
    .getByRole("textbox", { name: "Learning history folder" })
    .fill(repo);
  await page.getByRole("button", { name: "Create my workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Pick up your next lesson." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add a course", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Lesson link")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Close dialog" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Add lesson" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Close dialog" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Add a course", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Add a course", exact: true }).click();
  await dialog
    .getByLabel("Lesson link")
    .fill("https://www.udemy.com/course/cpp-practice/learn/lecture/42");
  await dialog.getByLabel("Course name").fill("C++ Masterclass");
  await dialog.getByLabel("Section", { exact: true }).fill("Pointers");
  await dialog.getByLabel("Lesson title").fill("Dynamic Memory Allocation");
  await dialog.getByRole("button", { name: "Add lesson" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Mirror course" }).click();
  await expect(
    page.getByText("Workspace ready", { exact: false }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/courses.png", fullPage: true });
  await page.getByRole("button", { name: "Start lesson", exact: true }).click();
  await page
    .getByText("Use my existing coding folder", { exact: true })
    .click();
  await page.getByLabel("Coding folder", { exact: true }).fill(source);
  await page
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Dynamic Memory Allocation",
      exact: true,
    }),
  ).toBeVisible();
  await writeFile(
    path.join(source, "main.cpp"),
    "#include <memory>\nint main() { auto number = std::make_unique<int>(42); return *number; }\n",
  );
  await writeFile(
    path.join(source, ".env"),
    "SHOULD_NOT_APPEAR=private-local-only",
  );
  await page
    .getByLabel("What clicked today?", { exact: false })
    .fill(
      "unique_ptr manages one owner and releases the object automatically.",
    );
  await page.screenshot({
    path: "test-results/active-session.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/active-session-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Finish & review" }).click();
  await expect(
    page.getByRole("dialog", { name: "Review your checkpoint" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Secret checks passed")).toBeVisible();
  await expect(page.locator(".file-list")).toContainText("main.cpp");
  await expect(page.locator(".file-list")).not.toContainText(".env");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/checkpoint-review-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/checkpoint-review.png",
    fullPage: true,
  });
  await writeFile(
    path.join(source, "main.cpp"),
    "// A newer edit after review\nint main() { return 0; }\n",
  );
  await page
    .getByRole("button", { name: "Save checkpoint", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 15000 });
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  const bootstrap = await (
    await request.post("/api/bootstrap", {
      headers: { Origin: baseURL! },
    })
  ).json();
  const state = await (
    await request.get("/api/state", {
      headers: { Authorization: `Bearer ${bootstrap.token}` },
    })
  ).json();
  expect(state.checkpoints).toHaveLength(1);
  expect(state.session).toBeNull();
  const storedPath = state.checkpoints[0].files.find((file: string) =>
    file.endsWith("/main.cpp"),
  );
  expect(await readFile(path.join(repo, storedPath), "utf8")).toContain(
    "make_unique",
  );
  expect(await readFile(path.join(source, "main.cpp"), "utf8")).toContain(
    "newer edit",
  );
  await page.locator(".workspace-more > summary").click();
  await page.getByRole("button", { name: "Checkpoints", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your checkpoints" }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/history.png", fullPage: true });
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await page.screenshot({
    path: "test-results/history-light.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Learning overview" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
});

test("loads and pairs the actual unpacked extension, captures an accessible Udemy fixture, and replays pending events", async ({
  request,
  baseURL,
}) => {
  const profile = await mkdtemp(
    path.join(tmpdir(), "gitlearn-extension-profile-"),
  );
  // Only transport addresses change in this disposable copy; never contact a learner's running companion.
  const extension = path.join(profile, "extension");
  await cp(path.resolve("dist/extension"), extension, { recursive: true });
  const testOrigin = new URL(baseURL!).origin;
  for (const file of await readdir(extension)) {
    if (!/\.(js|json|html)$/.test(file)) continue;
    const filename = path.join(extension, file);
    const content = await readFile(filename, "utf8");
    await writeFile(
      filename,
      content.replaceAll("http://127.0.0.1:47831", testOrigin),
    );
  }
  const context = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: "chromium",
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  try {
    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent("serviceworker");
    const id = new URL(worker.url()).hostname;
    expect(
      await worker.evaluate(
        async (origin) => (await fetch(`${origin}/api/bootstrap`)).status,
        testOrigin,
      ),
    ).toBe(403);
    expect(
      await worker.evaluate(
        async (origin) =>
          (
            await fetch(`${origin}/api/bootstrap`, {
              method: "POST",
            })
          ).status,
        testOrigin,
      ),
    ).toBe(403);
    const popup = await context.newPage();
    await popup.setViewportSize({ width: 360, height: 620 });
    await popup.goto(`chrome-extension://${id}/popup.html`);
    const bootstrap = await (
      await request.post("/api/bootstrap", {
        headers: { Origin: testOrigin },
      })
    ).json();
    const code = await (
      await request.post("/api/pair-code", {
        headers: { Authorization: `Bearer ${bootstrap.token}` },
        data: {},
      })
    ).json();
    await popup.getByLabel("Connection code from Setup").fill(code.code);
    await popup.getByRole("button", { name: "Connect", exact: true }).click();
    await expect(
      popup.getByText("Companion connected", { exact: true }),
    ).toBeVisible();
    const course = await context.newPage();
    await course.route("https://www.udemy.com/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<h1 data-purpose="course-header-title">Python Essentials</h1><section data-purpose="section-panel"><h2 data-purpose="section-title">Functions</h2><a href="/course/python-essentials/learn/lecture/100"><span data-purpose="item-title">First function</span></a></section><section data-purpose="transcript-panel"><p data-purpose="transcript-cue">A Python function has a name and a focused responsibility. Use return to send a result back to the caller.</p></section>',
      }),
    );
    await course.goto(
      "https://www.udemy.com/course/python-essentials/learn/lecture/100",
    );
    await expect
      .poll(async () => {
        const state = await (
          await request.get("/api/state", {
            headers: { Authorization: `Bearer ${bootstrap.token}` },
          })
        ).json();
        return state.courses.find(
          (item: { id: string }) => item.id === "python-essentials",
        )?.lessons[0]?.title;
      })
      .toBe("First function");
    await expect
      .poll(() =>
        worker.evaluate(async () => {
          const stored = await chrome.storage.local.get("outbox");
          return (stored.outbox as unknown[])?.length || 0;
        }),
      )
      .toBe(0);
    await popup.reload();
    await expect(
      popup.getByRole("heading", { name: "Python Essentials" }),
    ).toBeVisible();
    expect(
      await popup.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await popup.screenshot({ path: "test-results/extension-popup.png" });
    await popup.emulateMedia({ colorScheme: "dark" });
    await popup.screenshot({ path: "test-results/extension-popup-dark.png" });
    const libraryBefore = await (
      await request.get("/api/library?courseId=python-essentials", {
        headers: { Authorization: `Bearer ${bootstrap.token}` },
      })
    ).json();
    expect(
      libraryBefore.sources.filter(
        (source: { kind: string }) => source.kind === "transcript",
      ),
    ).toHaveLength(0);
    await course.bringToFront();
    await popup.evaluate(() =>
      (document.querySelector("#transcript") as HTMLButtonElement).click(),
    );
    await expect
      .poll(async () => {
        const library = await (
          await request.get("/api/library?courseId=python-essentials", {
            headers: { Authorization: `Bearer ${bootstrap.token}` },
          })
        ).json();
        return library.sources.filter(
          (source: { kind: string }) => source.kind === "transcript",
        ).length;
      })
      .toBe(1);
    await request.post("/api/unpair", {
      headers: { Authorization: `Bearer ${bootstrap.token}` },
      data: {},
    });
    await course.evaluate(() => {
      document.querySelector('[data-purpose="item-title"]')!.textContent =
        "First function revisited";
    });
    await expect
      .poll(() =>
        worker.evaluate(async () => {
          const stored = await chrome.storage.local.get("outbox");
          return (stored.outbox as unknown[])?.length || 0;
        }),
      )
      .toBeGreaterThan(0);
    const nextCode = await (
      await request.post("/api/pair-code", {
        headers: { Authorization: `Bearer ${bootstrap.token}` },
        data: {},
      })
    ).json();
    await popup.reload();
    await popup.getByLabel("Connection code from Setup").fill(nextCode.code);
    await popup.getByRole("button", { name: "Connect", exact: true }).click();
    await expect
      .poll(async () => {
        const state = await (
          await request.get("/api/state", {
            headers: { Authorization: `Bearer ${bootstrap.token}` },
          })
        ).json();
        return state.courses.find(
          (item: { id: string }) => item.id === "python-essentials",
        )?.lessons[0]?.title;
      })
      .toBe("First function revisited");
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test("appearance follows the system initially and keeps an explicit choice after reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Switch to dark mode" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(errors).toEqual([]);
});
