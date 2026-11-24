import { test, expect } from "@playwright/test";

test("the local app opens the independently built product and setup guide", async ({
  page,
}) => {
  await page.goto("/?view=setup");
  await page.getByRole("link", { name: "Guide", exact: true }).click();
  await expect(page).toHaveURL(/\/welcome\/$/);
  await expect(page).toHaveTitle("OutClass · Break free from tutorial hell");
  await page.getByRole("link", { name: "How it works", exact: true }).click();
  await expect(page).toHaveURL(/\/welcome\/setup.html$/);
  await expect(page.locator(".guide-list li")).toHaveCount(8);
  await page
    .getByRole("link", { name: "Get the downloads", exact: true })
    .click();
  await expect(page.locator("#extension-status")).toContainText(
    "pending review",
  );
});

test("GitHub setup gates repository actions until an account is verified", async ({
  page,
}) => {
  let signedIn = false;
  await page.route("**/api/state", (route) =>
    route.fulfill({
      json: {
        settings: {
          configured: true,
          repoPath: "C:\\Learning\\history",
          aiEnabled: false,
          remote: "",
        },
        courses: [],
        session: null,
        checkpoints: [],
        hasApiKey: false,
        gitAvailable: true,
        ghAvailable: true,
        extensionConnected: false,
        sourceFiles: 0,
      },
    }),
  );
  await page.route("**/api/github-status", (route) =>
    route.fulfill({
      json: {
        installed: true,
        authenticated: signedIn,
        login: signedIn ? "example-learner" : "",
      },
    }),
  );
  await page.goto("/?view=setup");
  await expect(
    page.getByRole("heading", { name: "One repository. Every course." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create private repo" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Sign in to GitHub" }),
  ).toBeVisible();
  signedIn = true;
  await page
    .getByRole("button", { name: "Check connection", exact: true })
    .click();
  await expect(
    page.getByText("Signed in as @example-learner.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in again" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create private repo" }),
  ).toBeEnabled();
  // No account login or repository mutation is performed by this test.
});
