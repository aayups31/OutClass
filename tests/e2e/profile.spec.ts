import { test, expect } from "@playwright/test";
import express from "express";
import type { Server } from "node:http";
import path from "node:path";
let server: Server, base: string;
test.beforeAll(async () => {
  server = express()
    .use(express.static(path.resolve("src/site")))
    .listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
for (const width of [1440, 390])
  test(`password sign-in opens a private profile at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    let signed = false;
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/v1/browser/**", async (route) => {
      const name = new URL(route.request().url()).pathname.split("/").at(-1);
      let result: any = {};
      if (name === "password") {
        signed = true;
        result = { authenticated: true };
      }
      if (name === "session")
        result = {
          authenticated: signed,
          email: "learner@example.com",
          usage: {
            used: 150,
            remaining: 450,
            limit: 600,
            period: "2026-11",
            plan: "paid",
            resetsAt: "2026-12-01T00:00:00.000Z",
          },
        };
      if (name === "config")
        result = { plan: null, freeLimit: 20, paidLimit: 600 };
      if (name === "profile")
        result = {
          profile: {
            name: "Aayu",
            interests: [],
            industries: [],
            learningGoals: [],
          },
        };
      if (name === "library")
        result = {
          enrolled: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              title: "Python foundations",
              revision: 1,
              status: "published",
            },
          ],
          created: [
            {
              id: "course-2",
              title: "Teaching with data",
              revision: 2,
              status: "published",
            },
          ],
        };
      if (name === "sign-out") {
        signed = false;
        result = { revoked: true };
      }
      await route.fulfill({ json: result });
    });
    await page.goto(base + "/account.html");
    await page.locator("#choose-signin").click();
    await page.locator("#account-email").fill("learner@example.com");
    await page.locator("#account-password").fill("Eight!42");
    await page.locator("#credentials-submit").click();
    await expect(page).toHaveURL(/\/profile.html$/);
    await expect(page.locator("#profile-name")).toHaveText("Aayu");
    await expect(page.locator("#usage-percent")).toHaveText("75");
    await expect(page.locator("#usage-left")).toHaveText("450");
    await expect(page.locator("#usage-used")).toHaveText("150");
    await expect(page.locator("#usage-limit")).toHaveText("600");
    await expect(page.locator("#usage-reset-time")).toHaveAttribute(
      "datetime",
      "2026-12-01T00:00:00.000Z",
    );
    await expect(
      page.getByRole("link", { name: "Your profile", exact: true }),
    ).toHaveText("A");
    await expect(
      page.getByRole("heading", { name: "Python foundations" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "View Python foundations" }),
    ).toHaveAttribute(
      "href",
      "academy.html?course=11111111-1111-4111-8111-111111111111#catalog",
    );
    await expect(page.locator("#usage-arc")).toHaveAttribute(
      "stroke-dashoffset",
      "25",
    );
    await page.getByRole("tab", { name: "Created" }).click();
    await expect(
      page.getByRole("heading", { name: "Teaching with data" }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Created" }).press("ArrowLeft");
    await expect(
      page.getByRole("heading", { name: "Python foundations" }),
    ).toBeVisible();
    await page.locator("#profile-refresh").click();
    await expect(page.locator("#profile-refresh")).toBeEnabled();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `.local/profile-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
    await page.locator("#profile-signout").click();
    await expect(page).toHaveURL(/\/account.html$/);
    await page.goto(base + "/profile.html");
    await expect(page).toHaveURL(/\/account.html$/);
  });
test("profile photo, empty courses and course-service failure preserve the account view", async ({
  page,
}) => {
  let failed = false;
  await page.route("https://lh3.googleusercontent.com/test-photo", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#6a82c5"/></svg>',
    }),
  );
  await page.route("**/v1/browser/**", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1);
    if (name === "session")
      return route.fulfill({
        json: {
          authenticated: true,
          name: "Aayu",
          email: "learner@example.com",
          avatarUrl: "https://lh3.googleusercontent.com/test-photo",
          usage: {
            used: 20,
            limit: 20,
            remaining: 0,
            period: "2026-11",
            plan: "free",
          },
        },
      });
    if (name === "profile")
      return route.fulfill({ json: { profile: { name: "Aayu" } } });
    if (failed)
      return route.fulfill({ status: 503, json: { error: "Unavailable" } });
    return route.fulfill({ json: { enrolled: [], created: [] } });
  });
  await page.goto(base + "/profile.html");
  await expect(page.locator(".nav-avatar img")).toBeVisible();
  await expect(page.locator("#usage-percent")).toHaveText("0");
  await expect(page.locator("#usage-arc")).toHaveAttribute(
    "stroke-opacity",
    "0",
  );
  await expect(
    page.getByText("A fresh page. A new possibility."),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Created" }).click();
  await expect(
    page.getByText("Your expertise could be someone’s beginning."),
  ).toBeVisible();
  failed = true;
  await page.locator("#profile-refresh").click();
  await expect(page.locator("#courses-status")).toContainText(
    "couldn’t be loaded",
  );
  await expect(page.locator("#usage-left")).toHaveText("0");
});
