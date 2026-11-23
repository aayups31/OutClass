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
  test(`account creation, verification and learning profile at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    let signed = false,
      profile: any = null;
    await page.route("**/v1/browser/**", async (route) => {
      const name = new URL(route.request().url()).pathname.split("/").at(-1),
        body = route.request().postDataJSON();
      let result: any = {};
      if (name === "config")
        result = { preview: true, paidLimit: 600, freeLimit: 20, plan: null };
      if (name === "session")
        result = {
          authenticated: signed,
          email: "learner@example.com",
          usage: {
            plan: "free",
            limit: 20,
            remaining: 20,
            used: 0,
            period: "2026-11",
          },
        };
      if (name === "register") {
        if (body.email === "existing@example.com") {
          await route.fulfill({
            status: 409,
            json: {
              error:
                "An account with this email already exists. Sign in with your password.",
            },
          });
          return;
        }
        expect(body.password).toBe("my unique learning passphrase");
        result = { sent: true };
      }
      if (name === "sign-out") {
        signed = false;
        result = { signedOut: true, revoked: true };
      }
      if (name === "password") {
        if (body.password !== "my unique learning passphrase") {
          await route.fulfill({
            status: 400,
            json: { error: "Sign-in failed. Check your credentials." },
          });
          return;
        }
        signed = true;
        result = { authenticated: true, email: "learner@example.com" };
      }
      if (name === "change-password") {
        expect(body).toEqual({
          currentPassword: "OldPass8!",
          password: "NewPass8!",
        });
        result = { updated: true };
      }
      if (name === "reset-password") {
        expect(body).toEqual({
          email: "learner@example.com",
          code: "123456",
          password: "ResetPass8!",
        });
        signed = true;
        result = { updated: true };
      }
      if (name === "verify") {
        if (body.code !== "123456") {
          await route.fulfill({
            status: 400,
            json: { error: "That code could not be verified." },
          });
          return;
        }
        signed = true;
        result = { authenticated: true, email: "learner@example.com" };
      }
      if (name === "profile") {
        if (body) profile = body;
        result = { profile };
      }
      await route.fulfill({ json: result });
    });
    await page.goto(base + "/account.html");
    await page.locator("#auth-flow").waitFor({ state: "visible" });
    await page.evaluate(async () => {
      const elements = document.querySelectorAll(".account-intro, #auth-flow");
      await Promise.all(
        [...elements].flatMap((element) =>
          element.getAnimations().map((animation) => animation.finished),
        ),
      );
    });
    await page.screenshot({
      path: `.local/account-signup-${width}.png`,
      fullPage: true,
    });
    await page.locator("#credentials-submit").click();
    await expect(page.locator("#account-email-error")).toHaveText(
      "Enter your email address.",
    );
    await expect(page.locator("#account-password-error")).toHaveText(
      "Enter your password.",
    );
    await expect(page.locator("#account-email")).toBeFocused();
    await expect(page.locator("#account-email")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await page.locator("#account-email-error").evaluate(async (element) => {
      await Promise.all(
        element.getAnimations().map((animation) => animation.finished),
      );
    });
    await page.screenshot({
      path: `.local/account-field-errors-${width}.png`,
      fullPage: true,
    });
    await page.locator("#account-email").fill("not-an-email");
    await expect(page.locator("#account-email-error")).toHaveText(
      "Use a valid email address.",
    );
    await page
      .getByLabel("Email address", { exact: true })
      .fill("existing@example.com");
    await page.getByLabel("Password", { exact: true }).fill("Eight!42");
    await expect(page.locator("#account-password-error")).toBeHidden();
    await page.locator("#email-form button[type=submit]").click();
    await expect(page.locator("#account-message")).toContainText(
      "already exists",
    );
    await expect(page.locator("#code-step")).toBeHidden();
    await page
      .getByLabel("Email address", { exact: true })
      .fill("learner@example.com");
    await page
      .getByLabel("Password", { exact: true })
      .fill("my unique learning passphrase");
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Check your inbox." }),
    ).toBeVisible();
    await page.getByLabel("Verification code", { exact: true }).fill("000000");
    await page.locator("#code-form button[type=submit]").click();
    await expect(page.locator("#account-message")).toContainText(
      "could not be verified",
    );
    await expect(page.locator("#account-dashboard")).toBeHidden();
    await page.getByLabel("Verification code", { exact: true }).fill("123456");
    await page.locator("#code-form button[type=submit]").click();
    await expect(
      page.getByRole("heading", { name: "Make it personal." }),
    ).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Your name", { exact: true }).fill("Aayu");
    await page.getByLabel("Programming", { exact: true }).check();
    await page.getByLabel("Education", { exact: true }).check();
    await expect(page.locator("#account-summary")).toBeHidden();
    await expect(page.getByLabel("Your name", { exact: true })).toHaveValue(
      "Aayu",
    );
    await page
      .getByLabel("What would you like to learn or build?", { exact: true })
      .fill("Build my first app");
    await page.getByRole("button", { name: "Save my profile" }).click();
    await expect(page.locator("#account-message")).toContainText(
      "profile is saved",
    );
    expect(profile).toMatchObject({ name: "Aayu", industries: ["Education"] });
    await page.getByText("Change password", { exact: false }).click();
    await page
      .getByLabel("Current password", { exact: true })
      .fill("OldPass8!");
    await page.locator("#new-password").fill("NewPass8!");
    await page.locator("#confirm-password").fill("Mismatch8!");
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.locator("#confirm-password-error")).toContainText(
      "don’t match",
    );
    await page.locator("#confirm-password").fill("NewPass8!");
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.locator("#account-message")).toContainText(
      "password has been updated",
    );
    await page.reload();
    await expect(page.locator("#signed-in-email")).toHaveText(
      "learner@example.com",
    );
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#profile-step")).toBeHidden();
    await page.locator("#edit-profile").click();
    await expect(page.getByLabel("Your name", { exact: true })).toHaveValue(
      "Aayu",
    );
    await expect(page.getByLabel("Education", { exact: true })).toBeChecked();
    await page.locator("#profile-step").evaluate(async (element) => {
      await Promise.all(
        element.getAnimations().map((animation) => animation.finished),
      );
    });
    expect(
      await page.evaluate(() =>
        JSON.stringify({ ...localStorage, ...sessionStorage }),
      ),
    ).not.toContain("passphrase");
    await page.screenshot({
      path: `.local/account-profile-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.local/account-creation-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Save my profile" }).click();
    await page.locator("#sign-out").click();
    await page.locator("#choose-signin").click();
    await expect(page.locator("#choose-code")).toHaveCount(0);
    await expect(page.locator("#code-step")).toBeHidden();
    await page.screenshot({
      path: `.local/account-signin-${width}.png`,
      fullPage: true,
    });
    await page
      .getByLabel("Email address", { exact: true })
      .fill("learner@example.com");
    await page
      .getByLabel("Password", { exact: true })
      .fill("wrong long passphrase");
    await page.locator("#email-form button[type=submit]").click();
    await expect(page.locator("#account-message")).toContainText(
      "Sign-in failed",
    );
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
    await page
      .getByLabel("Password", { exact: true })
      .fill("my unique learning passphrase");
    await page.locator("#email-form button[type=submit]").click();
    await expect(page.locator("#signed-in-email")).toBeVisible();
    await page.locator("#sign-out").click();
    await expect(page.locator("#choose-code")).toHaveCount(0);
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.locator("#code-step")).toBeHidden();
    await page.locator("#forgot-password").click();
    await page.locator("#credentials-submit").click();
    await expect(page.locator("#recovery-passwords")).toBeVisible();
    await page.getByLabel("Verification code", { exact: true }).fill("123456");
    await page.locator("#recovery-password").fill("ResetPass8!");
    await page.locator("#recovery-confirm").fill("ResetPass8!");
    await page
      .getByRole("button", { name: "Reset password", exact: true })
      .click();
    await expect(page.locator("#account-message")).toContainText(
      "Password reset",
    );
    await expect(page.locator("#recovery-password")).toHaveValue("");
  });
