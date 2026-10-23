import { test, expect } from "@playwright/test";
import express from "express";
import type { Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Store } from "../../src/server/store";
import { Application } from "../../src/server/application";
import { createApp } from "../../src/server/http";
const base = "http://127.0.0.1:47848";
let dir: string,
  store: Store,
  server: Server,
  web: ReturnType<typeof createApp>;
test.beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "outclass-products-"));
  store = new Store(path.join(dir, "data"));
  const app = new Application(store);
  await app.setup(path.join(dir, "history"), false);
  web = createApp(app, 47848);
  web.use(express.static(path.resolve("dist/web")));
  server = web.listen(47848, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
});
test.afterAll(async () => {
  await web.locals.stopPrograms();
  await new Promise<void>((r) => server.close(() => r()));
  store.close();
  await rm(dir, { recursive: true, force: true });
});
test("author a course, launch Learn, approve grounded copy and prepare a manual campaign", async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  expect((await request.get(base + "/api/expansion/state")).status()).toBe(401);
  await page.goto(base + "/?view=academy");
  await page
    .getByLabel("Course title", { exact: true })
    .fill("Practical Python activities");
  await page
    .getByLabel("Who is it for?", { exact: true })
    .fill("Beginners who know loops");
  await page
    .getByLabel("What will they build?", { exact: true })
    .fill("A correct activity report");
  await page.getByRole("button", { name: "Add lesson", exact: true }).click();
  await page
    .getByLabel("Lesson title 1", { exact: true })
    .fill("Accumulate totals");
  await page
    .getByLabel("Measurable objective 1", { exact: true })
    .fill("Group minutes by student");
  await page
    .getByLabel("Hands-on practice brief 1", { exact: true })
    .fill("Handle empty input and repeated students");
  await page
    .getByLabel("Lesson content 1", { exact: true })
    .fill("A dictionary can retain each student's running total.");
  await page.getByLabel("I own or have permission").check();
  await page
    .getByRole("button", {
      name: "Add Learn experience to lesson 1",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Acceptance criteria · one per line 1", { exact: true })
    .fill("Handle repeated students\nReturn zero for empty input");
  await page
    .getByLabel("Progressive hints · one per line 1", { exact: true })
    .fill("Predict one student’s running total first.");
  await page
    .getByRole("button", { name: "Add starter file", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save course draft", exact: true })
    .click();
  await expect(page.locator(".product-message[role=status]")).toContainText(
    "Draft saved",
  );
  await page
    .getByRole("button", { name: "Validate structure", exact: true })
    .click();
  await expect(page.locator(".product-message[role=status]")).toContainText(
    "not been executed",
  );
  page.on("dialog", (d) => d.accept());
  await page
    .getByRole("button", {
      name: "Compile & validate Python project",
      exact: true,
    })
    .click();
  await expect(page.locator(".product-ci-report")).toContainText("18/18", {
    timeout: 20000,
  });
  await page
    .getByRole("button", { name: "Approve local release", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Enroll locally · Free", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Open Accumulate totals in Learn/ })
    .click();
  await expect(page.locator(".topbar")).toContainText("Code & learn");
  expect(store.state().session?.note).toContain("Handle empty input");
  await page
    .locator(".layout-tools")
    .getByRole("button", { name: "Lesson", exact: true })
    .click();
  await expect(page.locator(".learn-assignment")).toContainText(
    "Handle repeated students",
  );
  await page.getByLabel("Handle repeated students", { exact: true }).check();
  await page.getByLabel("Return zero for empty input", { exact: true }).check();
  await page
    .getByLabel("Assignment reflection", { exact: true })
    .fill(
      "I compared repeated students and empty input using my own examples.",
    );
  await page
    .getByRole("button", { name: "Complete self-review", exact: true })
    .click();
  await expect(page.locator(".learn-assignment")).toContainText(
    "learner-reported progress",
  );
  expect(
    store.db
      .prepare(
        "SELECT count(*) AS total FROM rag_documents WHERE course_id=? AND kind='academy'",
      )
      .get(store.state().session!.courseId),
  ).toMatchObject({ total: 1 });
  await page.locator(".workspace-more > summary").click();
  await page
    .getByRole("button", { name: "Creator Studio", exact: true })
    .click();
  await page
    .getByLabel("Creative title", { exact: true })
    .fill("A lesson worth applying");
  const release = store.get<any>("expansion:v1").releases[0];
  await page
    .getByLabel("Course release", { exact: true })
    .selectOption(release.id);
  await page
    .getByLabel("Creative brief", { exact: true })
    .fill("A plain LinkedIn intro with the real practice outcome");
  await page
    .getByRole("button", {
      name: "Use source objective as a starting draft",
      exact: true,
    })
    .click();
  await page.getByLabel("I have rights to use").check();
  await page
    .getByRole("button", { name: "Save creative draft", exact: true })
    .click();
  await expect(page.locator(".product-message[role=status]")).toContainText(
    "Creative draft saved",
  );
  await page.getByRole("button", { name: "Approve copy", exact: true }).click();
  await expect(page.locator(".product-message[role=status]")).toContainText(
    "Copy approved",
  );
  await page
    .getByRole("button", { name: "Compose design preview", exact: true })
    .click();
  await expect(page.locator(".creator-design-preview")).toBeVisible();
  await page
    .getByLabel("Source video · up to 80 MB")
    .setInputFiles("src/site/assets/agents-film.mp4");
  await page
    .getByLabel("I have permission to edit and use this footage.")
    .check();
  await page
    .getByRole("button", { name: "Import & inspect video", exact: true })
    .click();
  await expect(page.getByLabel("Source library")).not.toHaveValue("", {
    timeout: 15000,
  });
  await page.locator(".media-transcript-panel > summary").click();
  await page
    .getByLabel("Owned footage transcript")
    .setInputFiles({
      name: "lesson.srt",
      mimeType: "text/plain",
      buffer: Buffer.from(
        "1\n00:00:01,000 --> 00:00:03,000\nGroup repeated students in a dictionary.\n\n2\n00:00:04,000 --> 00:00:06,000\nTrace the accumulated total.\n",
      ),
    });
  await page.getByLabel("I have permission to use this transcript").check();
  await page
    .getByRole("button", { name: "Index transcript locally", exact: true })
    .click();
  await expect(page.locator(".media-transcript-panel")).toContainText(
    "2 timed cues",
  );
  await page.getByLabel("Find a source moment").fill("repeated students");
  await page
    .locator(".media-transcript-search")
    .getByRole("button", { name: "Search", exact: true })
    .click();
  await page.getByRole("button", { name: "Add as scene", exact: true }).click();
  await expect(page.getByLabel("Start seconds 1")).toHaveValue("1");
  await expect(page.getByLabel("End seconds 1")).toHaveValue("3");
  await page
    .getByRole("button", { name: "Preview source footage", exact: true })
    .click();
  const footage = page.getByLabel("Source footage preview");
  await expect
    .poll(() => footage.evaluate((v: HTMLVideoElement) => v.duration))
    .toBeGreaterThan(19);
  await footage.evaluate((v: HTMLVideoElement) => {
    v.currentTime = 0.5;
  });
  await page
    .getByRole("button", { name: "Mark start from video", exact: true })
    .click();
  await expect(page.getByLabel("Start seconds 1")).toHaveValue("0.5");
  await page.getByLabel("End seconds 1").fill("2");
  await page.getByLabel("Caption 1").fill("Practice the actual concept");
  await page
    .getByRole("button", { name: "Save editable timeline", exact: true })
    .click();
  await expect(page.locator(".creator-media-panel")).toContainText(
    "Saved timeline v1",
  );
  await page.getByRole("button", { name: "GTM", exact: true }).click();
  await page
    .getByRole("button", { name: "Campaigns & insights", exact: true })
    .click();
  await page
    .getByLabel("Campaign title", { exact: true })
    .fill("Python launch");
  const creative = store.get<any>("expansion:v1").creatives[0];
  await page
    .getByLabel("Approved creative", { exact: true })
    .selectOption(creative.id);
  await page
    .getByLabel("Goal & hypothesis", { exact: true })
    .fill("Test whether beginners understand the outcome");
  await page
    .getByLabel("Destination URL", { exact: true })
    .fill("https://example.com/python");
  await page
    .getByRole("button", { name: "Save campaign plan", exact: true })
    .click();
  await expect(page.locator(".product-message[role=status]")).toContainText(
    "Nothing has been published or spent",
  );
  await expect(page.locator(".product-source").first()).toContainText(
    "utm_source=linkedin",
  );
  await page
    .getByLabel("Report source", { exact: true })
    .fill("LinkedIn supplied report");
  await page.getByLabel("Reported impressions", { exact: true }).fill("100");
  await page.getByLabel("Reported clicks", { exact: true }).fill("5");
  await page
    .getByRole("button", { name: "Record supplied report", exact: true })
    .click();
  await expect(page.locator(".gtm-report-grid")).toContainText("5.00%");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export manual handoff", exact: true })
    .click();
  expect((await download).suggestedFilename()).toContain("outclass-campaign-");
  await page
    .getByRole("button", { name: "Promotion studio", exact: true })
    .click();
  await page
    .getByLabel("Promotion course release", { exact: true })
    .selectOption(release.id);
  await page
    .getByLabel("Promotion title", { exact: true })
    .fill("Collections promotion");
  await page
    .getByLabel("Promotion audience", { exact: true })
    .fill("Beginners ready to use dictionaries in a real project");
  await page
    .getByLabel("Promotion destination", { exact: true })
    .fill("https://example.com/python");
  await page
    .getByLabel(
      "I have permission to promote this course and use its selected material.",
      { exact: true },
    )
    .check();
  await page
    .getByRole("button", { name: "Create channel drafts", exact: true })
    .click();
  await expect(page.locator(".gtm-promotion-grid")).toContainText("linkedin");
  await page
    .getByLabel("Promotional copy linkedin", { exact: true })
    .fill("Practice dictionaries by building your own activity report.");
  await page
    .getByRole("button", { name: "Save promotional copy", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Approve copy & prepare campaigns",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Open linkedin campaign", exact: true })
    .click();
  await expect(page.getByLabel("Campaign title", { exact: true })).toHaveValue(
    "Collections promotion · linkedin",
  );
  const composer = page.getByRole("region", {
    name: "Platform post composer",
    exact: true,
  });
  await expect(composer.getByLabel("LinkedIn post text")).toHaveValue(
    "Practice dictionaries by building your own activity report.",
  );
  await composer
    .getByLabel("LinkedIn post text")
    .fill(
      "A post I would actually write.\n\nTry a dictionary with repeated names, then handle empty input.",
    );
  await expect(composer.locator(".social-copy")).toContainText(
    "A post I would actually write.",
  );
  await composer
    .getByRole("button", { name: "Save post draft", exact: true })
    .click();
  await expect(composer.getByRole("status")).toContainText(
    "Draft saved on this device.",
  );
  await page
    .getByRole("button", { name: "Promotion studio", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create graphic & open post", exact: true })
    .first()
    .click();
  await expect(composer.locator(".social-image-grid img")).toBeVisible();
  await expect(composer.locator(".social-image-grid img")).toHaveJSProperty(
    "naturalWidth",
    1200,
  );
  await composer.scrollIntoViewIfNeeded();
  await composer.screenshot({
    path: ".local/landing-refresh/social-composer-linkedin.png",
  });
  await composer
    .getByRole("button", { name: "Mobile preview", exact: true })
    .click();
  await expect(composer.locator(".social-preview-stage")).toHaveClass(/mobile/);
  await composer
    .getByRole("button", { name: "Instagram", exact: true })
    .click();
  await expect(
    composer.getByLabel("Instagram post preview", { exact: true }),
  ).toBeVisible();
  await expect(composer.locator(".post-validation")).toContainText(
    "Instagram needs a photo",
  );
  const photoId = store.get<any[]>("gtm:images:v1")![0].id;
  await composer.getByLabel("Post image attachment").selectOption(photoId);
  await composer
    .getByRole("button", { name: "Attach photo", exact: true })
    .click();
  await expect(composer.locator(".social-carousel > img")).toHaveJSProperty(
    "naturalWidth",
    1200,
  );
  await composer
    .getByRole("button", { name: "Save post draft", exact: true })
    .click();
  await composer.screenshot({
    path: ".local/landing-refresh/social-composer-instagram.png",
  });
  await composer.getByRole("button", { name: "X", exact: true }).click();
  await composer
    .getByLabel("X post text")
    .fill("A short observation about practicing what you learn. 👨‍👩‍👧‍👦");
  await expect(
    composer.getByLabel("X post preview", { exact: true }),
  ).toBeVisible();
  await composer
    .getByRole("button", { name: "Save post draft", exact: true })
    .click();
  await composer.screenshot({
    path: ".local/landing-refresh/social-composer-x.png",
  });
  await composer.getByRole("button", { name: "YouTube", exact: true }).click();
  await composer
    .getByLabel("YouTube video title")
    .fill("Build a report from real inputs");
  await composer.getByLabel("YouTube audience").selectOption("false");
  const campaignForVideo = store
    .get<any>("expansion:v1")
    .campaigns.find((c: any) => c.title === "Collections promotion · linkedin");
  const production = store.get<any>("creator:production:v1");
  const headers = {
    Authorization: `Bearer ${store.get<string>("localToken")}`,
  };
  const rendered = await request.post(base + "/api/expansion/media/render", {
    headers,
    data: {
      creativeId: campaignForVideo.creativeId,
      expectedRevision: 1,
      assetId: production.assets[0].id,
      format: "landscape",
      scenes: [{ start: 0, end: 4, caption: "Practice a new concept" }],
      approveRender: true,
    },
  });
  expect(rendered.ok()).toBe(true);
  const renderedJob = await rendered.json();
  await expect
    .poll(
      () =>
        store
          .get<any>("creator:production:v1")
          .jobs.find((j: any) => j.id === renderedJob.id).state,
      { timeout: 30000 },
    )
    .toBe("ready");
  expect(
    (
      await request.post(
        base + `/api/expansion/media/${renderedJob.id}/approve`,
        { headers, data: { approveReviewed: true } },
      )
    ).ok(),
  ).toBe(true);
  await expect(
    composer
      .getByLabel("Post video attachment")
      .locator(`option[value="${renderedJob.id}"]`),
  ).toBeAttached({ timeout: 10000 });
  await composer
    .getByLabel("Post video attachment")
    .selectOption(renderedJob.id);
  await composer.getByLabel("YouTube thumbnail").selectOption(photoId);
  await composer
    .getByRole("button", { name: "Play approved video", exact: true })
    .click();
  await expect(composer.locator("video")).toHaveJSProperty("duration", 4);
  await composer
    .getByRole("button", { name: "Watch page", exact: true })
    .click();
  await expect(composer.locator(".social-video-title")).toHaveText(
    "Build a report from real inputs",
  );
  await expect(composer.locator(".post-validation")).toContainText(
    "Text and selected media pass",
  );
  await composer
    .getByRole("button", { name: "Save post draft", exact: true })
    .click();
  await composer.screenshot({
    path: ".local/landing-refresh/social-composer-youtube.png",
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Campaigns & insights", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Python launch/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Collections promotion · linkedin/ })
    .click();
  await page
    .getByRole("region", { name: "Platform post composer", exact: true })
    .getByRole("button", { name: "YouTube", exact: true })
    .click();
  await expect(page.getByLabel("YouTube video title")).toHaveValue(
    "Build a report from real inputs",
  );
  expect(errors).toEqual([]);
  await page.screenshot({
    path: ".local/landing-refresh/gtm-workspace.png",
    fullPage: true,
  });
});
