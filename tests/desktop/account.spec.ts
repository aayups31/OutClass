import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createGateway } from "../../services/ai/gateway";
test("packaged account sessions use Windows encryption, restore and sign out without provider keys", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "outclass-account-"));
  const session = {
    access_token: "account-test-access",
    refresh_token: "account-test-refresh",
    expires_at: Math.floor(Date.now() / 1000) + 600,
    email: "learner@example.com",
  };
  const service = createGateway({
    authenticate: async () => "13cb7941-378a-4936-a9c8-78453c20fbdf",
    auth: async (route) => (route === "otp" ? { sent: true } : session),
    answer: async () => ({
      answer: "What behavior should you test first?",
      citations: [],
    }),
    allowance: {
      reserve: async () => true,
      refund: async () => {},
      usage: async () => ({
        used: 0,
        limit: 20,
        remaining: 20,
        period: "2026-10",
        plan: "free",
      }),
    },
  }).listen(47847, "127.0.0.1");
  await new Promise<void>((r) => service.once("listening", r));
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (e): e is [string, string] => e[1] !== undefined,
      ),
    ),
    GITLEARN_PORT: "47846",
    GITLEARN_DATA_DIR: path.join(directory, "data"),
    GITLEARN_DESKTOP_USER_DATA: path.join(directory, "profile"),
    GITLEARN_DISABLE_DEV_KEY: "1",
    GITLEARN_HEADLESS_TEST: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const options = {
    args: process.env.GITLEARN_PACKAGED_TEST ? [] : ["."],
    executablePath: process.env.GITLEARN_PACKAGED_TEST,
    env,
  };
  let desktop = await electron.launch(options);
  try {
    const page = await desktop.firstWindow();
    await page.waitForLoadState();
    const version = JSON.parse(await readFile("package.json", "utf8")).version;
    const bundledGuide = await page.evaluate(async () =>
      (await fetch("/welcome/assets/release.json")).json(),
    );
    expect(await desktop.evaluate(({ app }) => app.getVersion())).toBe(version);
    // A local preview may be newer than the published downloads. Keep those
    // links pinned to the public release until its new assets are published.
    const publishedGuide = JSON.parse(
      await readFile("src/site/assets/release.json", "utf8"),
    );
    expect(bundledGuide).toEqual(publishedGuide);
    expect(bundledGuide.windows.url).toContain(
      `OutClass-Setup-${publishedGuide.version}.exe`,
    );
    await page.evaluate(
      async (root) => {
        const { token } = await (
          await fetch("/api/bootstrap", { method: "POST" })
        ).json();
        const post = async (route: string, body: unknown) => {
          const r = await fetch(`/api/${route}`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          return d;
        };
        await post("setup", { repoPath: root, aiEnabled: false });
        await post("ai-config", {
          mode: "included",
          service: "http://127.0.0.1:47847",
          localEndpoint: "http://127.0.0.1:11434/v1",
          localModel: "",
        });
        await post("ai-sign-in", { email: "learner@example.com" });
        await post("ai-verify", {
          email: "learner@example.com",
          code: "123456",
        });
        await post("assistant-enable", { enabled: true });
      },
      path.join(directory, "history"),
    );
    const encrypted = await readFile(
      path.join(directory, "profile", "ai-account.encrypted"),
    );
    expect(encrypted.includes(Buffer.from(session.access_token))).toBe(false);
    expect(encrypted.includes(Buffer.from(session.refresh_token))).toBe(false);
    // Seed an offline OAuth fixture through the actual Windows encryption API.
    const socialCipher = await desktop.evaluate(({ safeStorage }) => {
      const rows = [{ provider: "x", id: "fixture-channel", name: "Fixture channel",
        scopes: ["tweet.write"], expiresAt: Date.now() + 600000,
        connectedAt: new Date().toISOString(), token: "fixture-social-private" }];
      return safeStorage.encryptString(JSON.stringify(rows)).toString("base64");
    });
    await writeFile(path.join(directory, "profile", "social-accounts.encrypted"), Buffer.from(socialCipher, "base64"));
    await desktop.close();
    desktop = await electron.launch(options);
    const reopened = await desktop.firstWindow();
    await reopened.waitForLoadState();
    const result = await reopened.evaluate(async () => {
      const { token } = await (
        await fetch("/api/bootstrap", { method: "POST" })
      ).json();
      const headers = { Authorization: `Bearer ${token}` };
      return {
        access: await (await fetch("/api/ai-access", { headers })).json(),
        usage: await (await fetch("/api/ai-usage", { headers })).json(),
        state: await (await fetch("/api/state", { headers })).json(),
        social: await (await fetch("/api/expansion/social", { headers })).json(),
      };
    });
    expect(result.access.account.email).toBe(session.email);
    expect(result.access.ready).toBe(true);
    expect(result.state.hasApiKey).toBe(false);
    expect(result.state.hasAI).toBe(true);
    expect(result.usage.remaining).toBe(20);
    expect(JSON.stringify(result)).not.toContain(session.access_token);
    expect(result.social.find((s: {provider:string}) => s.provider === "x").connected).toBe(true);
    expect(JSON.stringify(result)).not.toContain("fixture-social-private");
    await reopened.evaluate(async () => {
      const { token } = await (
        await fetch("/api/bootstrap", { method: "POST" })
      ).json();
      const r = await fetch("/api/ai-sign-out", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      if (!r.ok) throw new Error("Sign out failed.");
      const social = await fetch("/api/expansion/social/x/disconnect", {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}"
      });
      if (!social.ok) throw new Error("Disconnect failed.");
    });
    const cleared = await readFile(path.join(directory, "profile", "social-accounts.encrypted"));
    expect(await desktop.evaluate(({ safeStorage }, encoded) =>
      safeStorage.decryptString(Buffer.from(encoded, "base64")), cleared.toString("base64"))).toBe("[]");
    expect(
      await readFile(
        path.join(directory, "profile", "ai-account.encrypted"),
      ).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
  } finally {
    await desktop.close().catch(() => {});
    await new Promise<void>((r) => service.close(() => r()));
    await rm(directory, { recursive: true, force: true });
  }
});
