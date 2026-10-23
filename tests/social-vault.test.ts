import { afterEach, expect, it, vi } from "vitest";
import {
  SocialConnections,
  type SocialSession,
} from "../src/server/social-connections";
afterEach(() => vi.unstubAllEnvs());
const fixture: SocialSession = {
  provider: "x",
  id: "learner-channel",
  name: "OutClass fixture",
  scopes: ["tweet.write"],
  expiresAt: Date.now() + 600000,
  connectedAt: new Date().toISOString(),
  token: "private-fixture-token",
  refresh: "private-fixture-refresh",
};
const transport = async (url: string | URL | Request) =>
  new Response(
    JSON.stringify(
      String(url).includes("token")
        ? {
            access_token: fixture.token,
            expires_in: 3600,
            scope: "tweet.write",
          }
        : { data: { id: fixture.id, username: fixture.name } },
    ),
  );
it("restores scoped connections only through the internal vault and never serializes tokens in public status", async () => {
  let saved: SocialSession[] = [fixture];
  const social = new SocialConnections(47831, transport as typeof fetch, {
    initial: saved,
    persist: async (rows) => {
      saved = structuredClone(rows);
    },
  });
  expect(social.account("x", true).id).toBe(fixture.id);
  expect(JSON.stringify(social.status())).not.toContain("private-fixture");
  expect(social.status().find((s) => s.provider === "x")!.note).toContain(
    "encrypted",
  );
  await social.disconnect("x");
  expect(saved).toEqual([]);
  const reopened = new SocialConnections(47831, transport as typeof fetch, {
    initial: saved,
  });
  expect(() => reopened.account("x")).toThrow(/Reconnect/);
  const expired = new SocialConnections(47831, transport as typeof fetch, {
    initial: [{ ...fixture, expiresAt: Date.now() - 1000 }],
  });
  expect(() => expired.account("x")).toThrow(/Reconnect/);
});
it("does not connect if encryption fails and cannot resurrect a disconnected in-flight authorization", async () => {
  vi.stubEnv("OUTCLASS_X_CLIENT_ID", "fixture-client");
  const failed = new SocialConnections(47831, transport as typeof fetch, {
      persist: async () => {
        throw Error("Vault unavailable");
      },
    }),
    auth = failed.authorize("x");
  await expect(
    failed.callback("x", new URL(auth.url).searchParams.get("state")!, "code"),
  ).rejects.toThrow("Vault unavailable");
  expect(() => failed.account("x")).toThrow(/Reconnect/);
  let release!: () => void,
    saved: SocialSession[] = [];
  const social = new SocialConnections(47831, transport as typeof fetch, {
      persist: async (rows) => {
        if (rows.length)
          await new Promise<void>((r) => {
            release = r;
          });
        saved = rows;
      },
    }),
    start = social.authorize("x");
  const pending = social.callback(
    "x",
    new URL(start.url).searchParams.get("state")!,
    "code",
  );
  const rejected = expect(pending).rejects.toThrow(/disconnected/);
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  const disconnect = social.disconnect("x");
  release();
  await rejected;
  await disconnect;
  expect(saved).toEqual([]);
  expect(() => social.account("x")).toThrow(/Reconnect/);
});
