import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const release = JSON.parse(readFileSync("src/site/assets/release.json", "utf8"));

test("product story leads to real downloads and a separate complete setup guide", async ({
  page,
}) => {
  const errors: string[] = [];
  const failures: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) failures.push(response.url());
  });
  await page.goto("/");
  await expect(page).toHaveTitle("OutClass · Break free from tutorial hell");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /OutClass\s*the lesson\./,
  );
  await expect(page.locator(".brand-orbit").first()).toHaveJSProperty(
    "naturalWidth",
    320,
  );
  await page.getByRole("tab", { name: "Ask the course", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Imported transcript");
  await page
    .getByRole("tab", { name: "Ask the course", exact: true })
    .press("ArrowLeft");
  await expect(page.getByRole("tabpanel")).toContainText("Your working code");
  await page.getByRole("link", { name: "How it works", exact: true }).click();
  await expect(page).toHaveURL(/setup.html$/);
  await expect(page.locator(".guide-list > li")).toHaveCount(8);
  await page
    .getByText("Do I need a GitHub repository?", { exact: true })
    .click();
  await expect(page.locator("details[open]")).toContainText(
    "one private repository for all your courses",
  );
  await page
    .getByRole("link", { name: "Get the downloads", exact: true })
    .click();
  await expect(page.locator("#windows-download")).toHaveAttribute(
    "href",
    /\/OutClass\/releases\/download\/v[\d.]+\/OutClass-Setup-[\d.]+\.exe$/,
  );
  await expect(page.locator("#extension-download")).toHaveAttribute(
    "href",
    /\/OutClass\/releases\/download\/v[\d.]+\/OutClass-Chrome-[\d.]+\.zip$/,
  );
  await expect(page.locator("#editor-download")).toHaveAttribute(
    "href",
    /\.vsix$/,
  );
  await expect(page.locator("#extension-status")).toContainText(
    "pending review",
  );
  await page.getByRole("link", { name: "Privacy", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Your learning stays yours.",
  );
  expect(errors).toEqual([]);
  expect(failures).toEqual([]);
});

test("carousel supports buttons and keyboard, reaches all three steps, and respects reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Previous learning step" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Next learning step" }).click();
  await expect(page.locator(".carousel-count")).toHaveText("02 / 03");
  await page.getByRole("button", { name: "Next learning step" }).click();
  await expect(page.locator(".carousel-count")).toHaveText("03 / 03");
  await expect(
    page.getByRole("button", { name: "Next learning step" }),
  ).toBeDisabled();
  const track = page.getByRole("region", { name: /Learning journey/ });
  await track.press("Home");
  await expect(page.locator(".carousel-count")).toHaveText("01 / 03");
  await track.press("ArrowRight");
  await expect(page.locator(".carousel-count")).toHaveText("02 / 03");
  await track.press("End");
  await expect(page.locator(".carousel-count")).toHaveText("03 / 03");
  await page.setViewportSize({ width: 375, height: 812 });
  await track.press("Home");
  await track.press("End");
  await expect(page.locator(".carousel-count")).toHaveText("03 / 03");
  await expect(
    page.getByRole("button", { name: "Next learning step" }),
  ).toBeDisabled();
});

test("hero wipe reverses and live motion preferences restore ordinary document flow", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("body")).toHaveClass(/motion-ready/);
  await expect(page.locator(".pin-spacer")).toHaveCount(1);
  await page.getByRole("link", { name: "Explore the workspace" }).click();
  await expect
    .poll(() =>
      page
        .locator("#product")
        .evaluate((el) => Math.round(el.getBoundingClientRect().top)),
    )
    .toBe(100);
  await expect
    .poll(() =>
      page
        .locator(".hero-copy")
        .evaluate((el) => Number(getComputedStyle(el).opacity)),
    )
    .toBeLessThan(0.9);
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await expect
    .poll(() =>
      page
        .locator(".hero-copy")
        .evaluate((el) => Number(getComputedStyle(el).opacity)),
    )
    .toBe(1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("body")).not.toHaveClass(/motion-ready/);
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
  await expect(page.locator(".hero-copy")).toHaveCSS("transform", "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator(".pin-spacer")).toHaveCount(1);
});

test("all pages fit desktop and mobile; assets and internal links resolve", async ({
  page,
  request,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/v1/browser/config", (route) =>
    route.fulfill({
      json: {
        preview: true,
        freeLimit: 20,
        paidLimit: 600,
        plan: {
          mode: "test",
          amount: 1200,
          currency: "cad",
          interval: "month",
        },
      },
    }),
  );
  await page.route("**/v1/browser/session", (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  const checked = new Set<string>();
  for (const width of [1440, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const route of [
      "/",
      "/product.html",
      "/setup.html",
      "/download.html",
      "/privacy.html",
      "/agents.html",
      "/account.html",
    ]) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const urls = await page
        .locator(
          'a[href], img[src], link[rel="stylesheet"], script[src], use[href]',
        )
        .evaluateAll((elements) =>
          elements
            .map((el) => el.getAttribute("href") || el.getAttribute("src"))
            .filter(Boolean),
        );
      for (const url of urls) {
        if (!url || url.startsWith("http") || url.startsWith("#")) continue;
        const path = new URL(url, page.url()).pathname;
        if (checked.has(path)) continue;
        checked.add(path);
        expect((await request.get(path)).ok(), path).toBe(true);
      }
      if (width === 1440 || width === 375) {
        if (route === "/")
          await page.screenshot({
            path: testInfo.outputPath(`${width}-hero.png`),
          });
        await page.screenshot({
          path: testInfo.outputPath(
            `${width}-${route === "/" ? "home" : route.slice(1, -5)}.png`,
          ),
          fullPage: true,
        });
      }
    }
  }
  expect(errors).toEqual([]);
});

test("account UI handles email codes, invalid attempts, allowance, Stripe handoff, and sign-out", async ({
  page,
}, testInfo) => {
  let authenticated = false,
    paid = false;
  const calls: string[] = [];
  await page.route("**/v1/browser/**", async (route) => {
    const action = new URL(route.request().url()).pathname.split("/").at(-1)!;
    calls.push(action);
    if (action === "config")
      return route.fulfill({
        json: {
          preview: true,
          freeLimit: 20,
          paidLimit: 600,
          plan: {
            amount: 1200,
            currency: "cad",
            interval: "month",
            mode: "test",
          },
        },
      });
    if (action === "session")
      return route.fulfill({
        json: authenticated
          ? {
              authenticated: true,
              email: "learner@example.com",
              usage: {
                used: 1,
                limit: paid ? 600 : 20,
                remaining: paid ? 599 : 19,
                plan: paid ? "paid" : "free",
                period: "2026-10",
              },
            }
          : { authenticated: false },
      });
    if (action === "email") return route.fulfill({ json: { sent: true } });
    if (action === "verify") {
      if (route.request().postDataJSON().code !== "123456")
        return route.fulfill({
          status: 400,
          json: {
            error:
              "That code could not be verified. Check the latest email or request a new code.",
          },
        });
      authenticated = true;
      return route.fulfill({
        json: { authenticated: true, email: "learner@example.com" },
      });
    }
    if (action === "sign-out") {
      authenticated = false;
      return route.fulfill({ json: { signedOut: true, revoked: true } });
    }
    if (action === "checkout")
      return route.fulfill({
        json: {
          url: "https://checkout.stripe.com/c/pay/test_outclass_fixture",
        },
      });
    return route.fulfill({ status: 404, json: { error: "Unexpected route" } });
  });
  await page.goto("/account.html");
  await expect(
    page.getByRole("heading", { name: "Welcome to OutClass.", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("account-sign-in.png"),
    fullPage: true,
  });
  await page
    .getByLabel("Email address", { exact: true })
    .fill("learner@example.com");
  await page.getByRole("button", { name: "Continue with email" }).click();
  await expect(
    page.getByRole("heading", { name: "Check your inbox." }),
  ).toBeVisible();
  await expect(page.locator("#resend-code")).toBeDisabled();
  await page.getByLabel("Sign-in code", { exact: true }).fill("000000");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#account-message")).toContainText(
    "could not be verified",
  );
  await page.getByLabel("Sign-in code", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#answers-left")).toHaveText("19");
  await expect(page.locator("#billing-mode")).toHaveText("Stripe test mode");
  await page.screenshot({
    path: testInfo.outputPath("account-allowance.png"),
    fullPage: true,
  });
  paid = true;
  await page.getByRole("button", { name: "Refresh allowance" }).click();
  await expect(page.locator("#answers-left")).toHaveText("599");
  await expect(
    page.getByRole("button", { name: "Manage subscription", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome to OutClass.", exact: true }),
  ).toBeVisible();
  expect(calls.filter((call) => call === "email")).toHaveLength(1);
  // Test only the redirect to the hosted test fixture; no real payment is submitted.
  authenticated = true;
  await page.reload();
  await page.route(
    "https://checkout.stripe.com/c/pay/test_outclass_fixture",
    (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<h1>Hosted Stripe test fixture</h1>",
      }),
  );
  await page
    .getByRole("button", { name: "Manage subscription", exact: true })
    .click();
  await expect(page).toHaveURL(
    "https://checkout.stripe.com/c/pay/test_outclass_fixture",
  );
});

test("hero art appears once and mobile navigation exposes agents and setup", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(
    page.locator('.hero img[src="assets/hero-tiles.webp"]'),
  ).toHaveCount(1);
  await expect(page.locator('img[src="assets/hero-tiles.webp"]')).toHaveCount(
    1,
  );
  await expect(
    page.locator(
      ".eyebrow,.section-kicker,.hero-signal,.ecosystem-caption,.footer-statement",
    ),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Agents", exact: true }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /Go further\.\s*Think for yourself\./,
  );
  await expect(page.locator('img[src="assets/hero-tiles.webp"]')).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Close navigation", exact: true })
    .press("Escape");
  await expect(
    page.getByRole("button", { name: "Open navigation", exact: true }),
  ).toBeFocused();
});

test("downloads and the product story remain usable without animation scripts or JavaScript", async ({
  browser,
  page,
}) => {
  await page.route("**/assets/vendor/**", (route) => route.abort());
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Next learning step" }).click();
  await expect(page.locator(".carousel-count")).toHaveText("02 / 03");
  expect(errors).toEqual([]);
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 375, height: 812 },
  });
  const nojs = await context.newPage();
  await nojs.goto("http://127.0.0.1:47832/");
  await expect(nojs.getByRole("heading", { level: 1 })).toBeVisible();
  await nojs
    .getByRole("link", { name: "Get OutClass", exact: true })
    .first()
    .click();
  await expect(nojs.locator("#windows-download")).toHaveAttribute(
    "href",
    release.windows.url,
  );
  await nojs
    .getByRole("link", { name: "Follow the setup guide", exact: true })
    .click();
  await expect(nojs.locator(".guide-list > li")).toHaveCount(8);
  await context.close();
});

test("vertical scrolling advances and reverses the pinned learning carousel", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".journey-section")).toHaveClass(
    /journey-scroll-pinned/,
  );
  const bounds = await page.evaluate(() => {
    const trigger = (window as any).ScrollTrigger.getById("learning-journey");
    return { start: trigger.start, end: trigger.end };
  });
  await page.evaluate((y) => window.scrollTo(0, y), bounds.start);
  await expect
    .poll(() => page.locator(".journey-track").evaluate((el) => el.scrollLeft))
    .toBeLessThan(2);
  await page.evaluate((y) => window.scrollTo(0, y), bounds.end);
  await expect(page.locator(".carousel-count")).toHaveText("03 / 03");
  await page.evaluate((y) => window.scrollTo(0, y), bounds.start);
  await expect(page.locator(".carousel-count")).toHaveText("01 / 03");
  await page.getByRole("button", { name: "Next learning step" }).click();
  await expect(page.locator(".carousel-count")).toHaveText("02 / 03");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".journey-section")).not.toHaveClass(
    /journey-scroll-pinned/,
  );
});
