import { Router } from "express";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { UserError } from "./safety.js";
export const providers = ["youtube", "linkedin", "x", "instagram"] as const;
export type SocialProvider = (typeof providers)[number];
const settings = {
  youtube: {
    auth: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
    ],
    pkce: true,
    write: "https://www.googleapis.com/auth/youtube.upload",
  },
  linkedin: {
    auth: "https://www.linkedin.com/oauth/v2/authorization",
    token: "https://www.linkedin.com/oauth/v2/accessToken",
    scopes: ["openid", "profile", "w_member_social"],
    pkce: false,
    write: "w_member_social",
  },
  x: {
    auth: "https://x.com/i/oauth2/authorize",
    token: "https://api.x.com/2/oauth2/token",
    scopes: [
      "tweet.read",
      "tweet.write",
      "users.read",
      "offline.access",
      "media.write",
    ],
    pkce: true,
    write: "tweet.write",
  },
  instagram: {
    auth: "https://www.instagram.com/oauth/authorize",
    token: "https://api.instagram.com/oauth/access_token",
    scopes: ["instagram_business_basic", "instagram_business_content_publish"],
    pkce: false,
    write: "instagram_business_content_publish",
  },
};
export type SocialAccount = {
  provider: SocialProvider;
  id: string;
  name: string;
  scopes: string[];
  expiresAt: number;
  connectedAt: string;
};
export type SocialSession = SocialAccount & { token: string; refresh?: string };
export type SocialVault = {
  initial?: unknown;
  persist?: (sessions: SocialSession[]) => Promise<void>;
};
const storedSessions = z
  .array(
    z
      .object({
        provider: z.enum(providers),
        id: z.string().min(1).max(200),
        name: z.string().max(500),
        scopes: z.array(z.string().max(250)).max(20),
        expiresAt: z.number().finite().positive(),
        connectedAt: z.string().max(50),
        token: z.string().min(1).max(12000),
        refresh: z.string().max(12000).optional(),
      })
      .strict(),
  )
  .max(4);
export class SocialConnections {
  private pending = new Map<
    string,
    {
      provider: SocialProvider;
      verifier: string;
      redirect: string;
      expires: number;
      generation: number;
    }
  >();
  private sessions = new Map<SocialProvider, SocialSession>();
  private generations = new Map<SocialProvider, number>();
  private writes: Promise<void> = Promise.resolve();
  constructor(
    private port: number,
    private send: typeof fetch = fetch,
    private vault: SocialVault = {},
  ) {
    const parsed = storedSessions.safeParse(vault.initial || []);
    if (parsed.success)
      for (const session of parsed.data)
        this.sessions.set(session.provider, session);
  }
  private enqueue(write: () => Promise<void>) {
    const next = this.writes.catch(() => {}).then(write);
    this.writes = next;
    return next;
  }
  private config(provider: SocialProvider) {
    const prefix = `OUTCLASS_${provider.toUpperCase()}`;
    return {
      id: process.env[prefix + "_CLIENT_ID"] || "",
      secret: process.env[prefix + "_CLIENT_SECRET"] || "",
    };
  }
  status() {
    return providers.map((provider) => {
      const session = this.sessions.get(provider),
        config = this.config(provider),
        expired = !!session && session.expiresAt <= Date.now();
      return {
        provider,
        configured:
          !!config.id &&
          (!["youtube", "linkedin", "instagram"].includes(provider) ||
            !!config.secret),
        account: session
          ? {
              id: session.id,
              name: session.name,
              connectedAt: session.connectedAt,
              expiresAt: session.expiresAt,
            }
          : null,
        connected: !!session && !expired,
        scopes: session?.scopes || [],
        canPublish:
          !!session &&
          !expired &&
          session.scopes.includes(settings[provider].write),
        note: session
          ? expired
            ? "Session expired; reconnect."
            : this.vault.persist
              ? "Connection encrypted with your Windows account; reconnect when its token expires."
              : "Tokens stay in this process. Reconnect after restart."
          : "Connect your developer app to authorize an account.",
      };
    });
  }
  authorize(provider: SocialProvider) {
    const config = this.config(provider);
    if (
      !config.id ||
      (["youtube", "linkedin", "instagram"].includes(provider) &&
        !config.secret)
    )
      throw new UserError(
        `Configure the ${provider} developer application's client credentials privately before connecting.`,
        503,
      );
    for (const [key, value] of this.pending)
      if (value.expires < Date.now()) this.pending.delete(key);
    if (this.pending.size >= 8)
      throw new UserError(
        "Finish an open authorization before starting another.",
      );
    const state = randomBytes(32).toString("base64url"),
      verifier = randomBytes(40).toString("base64url");
    const base =
      process.env.OUTCLASS_SOCIAL_REDIRECT_BASE ||
      "https://git-learn-black.vercel.app/v1/social/callback";
    const redirect = base.replace(/\/$/, "") + "/" + provider;
    const url = new URL(settings[provider].auth);
    url.searchParams.set("client_id", config.id);
    url.searchParams.set("redirect_uri", redirect);
    url.searchParams.set("response_type", "code");
    url.searchParams.set(
      "scope",
      settings[provider].scopes.join(provider === "instagram" ? "," : " "),
    );
    url.searchParams.set("state", state);
    if (settings[provider].pkce) {
      url.searchParams.set(
        "code_challenge",
        createHash("sha256").update(verifier).digest("base64url"),
      );
      url.searchParams.set("code_challenge_method", "S256");
    }
    if (provider === "youtube") url.searchParams.set("access_type", "offline");
    this.pending.set(state, {
      provider,
      verifier,
      redirect,
      expires: Date.now() + 600000,
      generation: this.generations.get(provider) || 0,
    });
    return {
      url: url.href,
      callbackLocal: `http://127.0.0.1:${this.port}/social/callback/${provider}`,
    };
  }
  private async request(url: string, token: string) {
    const response = await this.send(url, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new UserError(
        "The channel API rejected this request. Check account eligibility, granted scopes and developer-app access.",
        response.status === 429 ? 429 : 403,
      );
    return response.json();
  }
  async callback(provider: SocialProvider, state: string, code: string) {
    const pending = this.pending.get(state);
    this.pending.delete(state);
    if (
      !pending ||
      pending.provider !== provider ||
      pending.expires < Date.now()
    )
      throw new UserError(
        "This authorization is expired or does not belong to this connection.",
        403,
      );
    const config = this.config(provider),
      body = new URLSearchParams({
        client_id: config.id,
        code,
        redirect_uri: pending.redirect,
        grant_type: "authorization_code",
      });
    if (config.secret && provider !== "x")
      body.set("client_secret", config.secret);
    if (settings[provider].pkce) body.set("code_verifier", pending.verifier);
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };
    if (provider === "x" && config.secret)
      headers.Authorization =
        "Basic " +
        Buffer.from(`${config.id}:${config.secret}`).toString("base64");
    const response = await this.send(settings[provider].token, {
      method: "POST",
      headers,
      body,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new UserError(
        "The platform did not accept the authorization code. Check its exact registered callback URL.",
      );
    const result = (await response.json()) as any;
    if (
      typeof result.access_token !== "string" ||
      result.access_token.length > 10000
    )
      throw new UserError("The platform did not return a usable access token.");
    const token = result.access_token;
    let id = "",
      name = "";
    if (provider === "youtube") {
      const profile = await this.request(
        "https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true",
        token,
      );
      id = profile.items?.[0]?.id;
      name = profile.items?.[0]?.snippet?.title;
    }
    if (provider === "linkedin") {
      const profile = await this.request(
        "https://api.linkedin.com/v2/userinfo",
        token,
      );
      id = profile.sub;
      name = profile.name;
    }
    if (provider === "x") {
      const profile = await this.request("https://api.x.com/2/users/me", token);
      id = profile.data?.id;
      name = profile.data?.username;
    }
    if (provider === "instagram") {
      const profile = await this.request(
        "https://graph.instagram.com/v25.0/me?fields=user_id,username",
        token,
      );
      id = profile.user_id || profile.id;
      name = profile.username;
    }
    if (typeof id !== "string" || !id || typeof name !== "string")
      throw new UserError(
        "The platform did not confirm an eligible account identity.",
      );
    let scopes =
      typeof result.scope === "string"
        ? result.scope.split(/[\s,]+/).filter(Boolean)
        : Array.isArray(result.permissions)
          ? result.permissions.filter((s: unknown) => typeof s === "string")
          : [];
    if (provider === "linkedin" && scopes.length === 0) {
      const inspection = await this.send(
        "https://www.linkedin.com/oauth/v2/introspectToken",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: config.id,
            client_secret: config.secret,
            token,
          }),
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        },
      );
      if (inspection.ok) {
        const verified = await inspection.json();
        if (verified.active === true && typeof verified.scope === "string")
          scopes = verified.scope.split(/[\s,]+/).filter(Boolean);
      }
    }
    const session: SocialSession = {
      provider,
      id,
      name,
      token,
      refresh: result.refresh_token,
      scopes,
      expiresAt:
        Date.now() +
        Math.max(60, Math.min(Number(result.expires_in) || 3600, 86400)) * 1000,
      connectedAt: new Date().toISOString(),
    };
    await this.enqueue(async () => {
      if ((this.generations.get(provider) || 0) !== pending.generation)
        throw new UserError(
          "This channel was disconnected while authorization was completing.",
          409,
        );
      const next = new Map(this.sessions);
      next.set(provider, session);
      if (this.vault.persist) await this.vault.persist([...next.values()]);
      if ((this.generations.get(provider) || 0) !== pending.generation)
        throw new UserError(
          "This channel was disconnected while authorization was completing.",
          409,
        );
      this.sessions = next;
    });
    return this.status().find((s) => s.provider === provider);
  }
  account(provider: SocialProvider, write = false) {
    const account = this.sessions.get(provider);
    if (!account || account.expiresAt < Date.now())
      throw new UserError("Reconnect this channel before continuing.", 401);
    if (write && !account.scopes.includes(settings[provider].write))
      throw new UserError(
        "The platform did not confirm the publishing scope. Use a manual export or reconnect with the approved scope.",
        403,
      );
    return account;
  }
  async disconnect(provider: SocialProvider) {
    this.generations.set(provider, (this.generations.get(provider) || 0) + 1);
    for (const [id, value] of this.pending)
      if (value.provider === provider) this.pending.delete(id);
    this.sessions.delete(provider);
    await this.enqueue(async () => {
      if (this.vault.persist)
        await this.vault.persist([...this.sessions.values()]);
    });
    return this.status();
  }
  routes() {
    const router = Router();
    router.get("/", (_req, res) => res.json(this.status()));
    router.post("/:provider/connect", (req, res) =>
      res.json(this.authorize(z.enum(providers).parse(req.params.provider))),
    );
    router.post("/:provider/disconnect", async (req, res) =>
      res.json(
        await this.disconnect(z.enum(providers).parse(req.params.provider)),
      ),
    );
    return router;
  }
  callbacks() {
    const router = Router();
    router.get("/:provider", async (req, res) => {
      const p = z.enum(providers).parse(req.params.provider),
        input = z
          .object({
            state: z.string().min(30).max(150),
            code: z.string().min(1).max(5000),
          })
          .parse(req.query);
      await this.callback(p, input.state, input.code);
      res.setHeader("Cache-Control", "no-store");
      res
        .type("text")
        .send(
          "Your channel is connected to the running OutClass app. Return to GTM to review its permissions.",
        );
    });
    return router;
  }
}
