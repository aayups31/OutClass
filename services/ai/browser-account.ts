import express from "express";
import { z } from "zod";
import type { GatewayDependencies } from "./gateway.js";
import {
  accountProfile,
  accountCredentials,
} from "../../src/account-profile.js";

export type BrowserPlan = {
  amount: number;
  currency: string;
  interval: "month";
  mode: "test" | "live";
};
export type BrowserAccount = {
  origin: string;
  preview: boolean;
  freeLimit: number;
  paidLimit: number;
  identity: (token: string) => Promise<{ id: string; email: string }>;
  signOut: (token: string) => Promise<void>;
  profile?: (
    token: string,
    value?: z.infer<typeof accountProfile>,
  ) => Promise<unknown>;
  plan?: () => Promise<BrowserPlan>;
};
const sessionSchema = z.object({
  access_token: z.string().min(1).max(3800),
  refresh_token: z.string().min(1).max(3800),
  expires_at: z.number().int().positive(),
  email: z.string().email(),
});
const accessName = "__Host-outclass-access";
const refreshName = "__Host-outclass-refresh";
const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "strict" as const,
  path: "/",
};
function cookies(req: express.Request) {
  const values = new Map<string, string>();
  for (const pair of (req.headers.cookie || "").split(";")) {
    const equals = pair.indexOf("=");
    if (equals < 0) continue;
    const name = pair.slice(0, equals).trim();
    if (values.has(name)) continue;
    try {
      const value = decodeURIComponent(pair.slice(equals + 1));
      if (value.length <= 3800) values.set(name, value);
    } catch {
      /* Invalid cookies never become credentials. */
    }
  }
  return values;
}
function clear(res: express.Response) {
  res.clearCookie(accessName, cookieOptions);
  res.clearCookie(refreshName, cookieOptions);
}
function save(res: express.Response, input: unknown) {
  const session = sessionSchema.parse(input);
  res.cookie(accessName, session.access_token, {
    ...cookieOptions,
    maxAge: Math.max(1, session.expires_at * 1000 - Date.now()),
  });
  res.cookie(refreshName, session.refresh_token, {
    ...cookieOptions,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  return session;
}
function temporaryFailure(error: unknown) {
  const status = (error as { status?: number })?.status;
  return (
    (typeof status === "number" && (status >= 500 || status === 429)) ||
    error instanceof TypeError ||
    ["TimeoutError", "AbortError"].includes(
      (error as { name?: string })?.name || "",
    )
  );
}

// Browser credentials stay in HttpOnly cookies; they are never returned to
// static page JavaScript or shared with the desktop application's session.
export function browserAccountRoutes(
  deps: GatewayDependencies,
  limited: (key: string, max: number) => boolean,
) {
  const options = deps.browser!;
  const origin = new URL(options.origin);
  if (origin.protocol !== "https:" || origin.username || origin.password)
    throw new Error("Browser accounts require a trusted HTTPS origin.");
  const router = express.Router();
  router.use((req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Pragma", "no-cache");
    if (
      req.method !== "GET" &&
      (req.headers.origin !== origin.origin || !req.is("application/json"))
    ) {
      res
        .status(403)
        .json({ error: "Open the OutClass account page to continue." });
      return;
    }
    if (limited(`browser:${req.ip}`, 24)) {
      res
        .status(429)
        .json({ error: "Please wait a minute before trying again." });
      return;
    }
    next();
  });
  async function identity(req: express.Request, res: express.Response) {
    const stored = cookies(req);
    const token = stored.get(accessName);
    if (token) {
      try {
        const account = z
          .object({ id: z.string().uuid(), email: z.string().email() })
          .parse(await options.identity(token));
        return { ...account, token };
      } catch (error) {
        if (temporaryFailure(error)) throw error;
        /* A valid refresh token may restore an expired session. */
      }
    }
    const refresh = stored.get(refreshName);
    if (!refresh) {
      clear(res);
      return null;
    }
    try {
      const session = sessionSchema.parse(
        await deps.auth("token?grant_type=refresh_token", {
          refresh_token: refresh,
        }),
      );
      const account = z
        .object({ id: z.string().uuid(), email: z.string().email() })
        .parse(await options.identity(session.access_token));
      save(res, session);
      return { ...account, token: session.access_token };
    } catch (error) {
      if (temporaryFailure(error)) throw error;
      clear(res);
      return null;
    }
  }
  if (deps.academy)
    router.use(
      "/academy",
      async (req, res, next) => {
        const account = await identity(req, res);
        if (!account) {
          res.status(401).json({
            error:
              "Sign in to OutClass before enrolling or creating a launch code.",
          });
          return;
        }
        res.locals.user = account.id;
        next();
      },
      deps.academy.privateRoutes(),
    );
  router.get("/config", async (_req, res) => {
    let plan: BrowserPlan | null = null;
    if (options.plan) {
      try {
        plan = await options.plan();
      } catch {
        /* A failed price lookup disables checkout in the UI. */
      }
    }
    res.json({
      preview: options.preview,
      freeLimit: options.freeLimit,
      paidLimit: options.paidLimit,
      plan,
    });
  });
  router.post("/register", async (req, res) => {
    if (limited(`auth:${req.ip}`, 6)) {
      res.status(429).json({ error: "Wait a minute before trying again." });
      return;
    }
    try {
      const credentials = accountCredentials.parse(req.body);
      await deps.auth("signup", credentials);
      res.json({ sent: true });
    } catch {
      res.status(400).json({
        error:
          "Account creation could not be completed. Use a password of 12–128 characters, check your email, or sign in if you already have an account.",
      });
    }
  });
  router.post("/password", async (req, res) => {
    if (limited(`auth:${req.ip}`, 6)) {
      res.status(429).json({ error: "Wait a minute before trying again." });
      return;
    }
    try {
      const credentials = accountCredentials.parse(req.body),
        session = sessionSchema.parse(
          await deps.auth("token?grant_type=password", credentials),
        );
      await options.identity(session.access_token);
      save(res, session);
      res.json({ authenticated: true, email: session.email });
    } catch {
      res.status(400).json({
        error:
          "Sign-in failed. Check your credentials and verify your email, or use an email code.",
      });
    }
  });
  router.get("/profile", async (req, res) => {
    const account = await identity(req, res);
    if (!account) {
      res.status(401).json({ error: "Sign in before opening your profile." });
      return;
    }
    if (!options.profile) {
      res.status(503).json({ error: "Profile service unavailable." });
      return;
    }
    const profile = accountProfile.safeParse(
      await options.profile(account.token),
    );
    res.json({ profile: profile.success ? profile.data : null });
  });
  router.post("/profile", async (req, res) => {
    const account = await identity(req, res);
    if (!account) {
      res.status(401).json({ error: "Sign in before saving your profile." });
      return;
    }
    const parsed = accountProfile.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Enter your name and up to 15 choices per category." });
      return;
    }
    if (!options.profile) {
      res.status(503).json({ error: "Profile service unavailable." });
      return;
    }
    res.json({ profile: await options.profile(account.token, parsed.data) });
  });
  router.post("/email", async (req, res) => {
    if (limited(`auth:${req.ip}`, 6)) {
      res.status(429).json({
        error: "Wait a minute before requesting another sign-in code.",
      });
      return;
    }
    try {
      const { email } = z
        .object({ email: z.string().trim().email().max(254) })
        .parse(req.body);
      await deps.auth("otp", { email, create_user: true });
      res.json({ sent: true });
    } catch (error) {
      res.status(error instanceof z.ZodError ? 400 : 503).json({
        error:
          error instanceof z.ZodError
            ? "Enter a valid email address."
            : "The sign-in email could not be sent. Included AI is currently limited to the connected test account. You can use the desktop app with a personal key or local model.",
      });
    }
  });
  router.post("/verify", async (req, res) => {
    if (limited(`auth:${req.ip}`, 6)) {
      res
        .status(429)
        .json({ error: "Wait a minute before trying another code." });
      return;
    }
    try {
      const { email, code } = z
        .object({
          email: z.string().trim().email().max(254),
          code: z.string().regex(/^\d{6,8}$/),
        })
        .parse(req.body);
      const session = sessionSchema.parse(
        await deps.auth("verify", { email, token: code, type: "email" }),
      );
      // Verify with the identity provider before establishing browser cookies.
      const account = z
        .object({ id: z.string().uuid(), email: z.string().email() })
        .parse(await options.identity(session.access_token));
      save(res, session);
      res.json({ authenticated: true, email: account.email });
    } catch {
      res.status(400).json({
        error:
          "That code could not be verified. Check the latest email or request a new code.",
      });
    }
  });
  router.get("/session", async (req, res) => {
    const account = await identity(req, res);
    if (!account) {
      res.json({ authenticated: false });
      return;
    }
    try {
      res.json({
        authenticated: true,
        email: account.email,
        usage: await deps.allowance.usage(account.id),
      });
    } catch {
      res
        .status(503)
        .json({ error: "Your allowance could not be loaded. Please retry." });
    }
  });
  router.post("/checkout", async (req, res) => {
    const account = await identity(req, res);
    if (!account) {
      res.status(401).json({ error: "Sign in again before opening billing." });
      return;
    }
    if (!deps.checkout) {
      res.status(503).json({ error: "Billing is not available yet." });
      return;
    }
    try {
      const url = new URL(await deps.checkout(account.id));
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        !["checkout.stripe.com", "billing.stripe.com"].includes(url.hostname)
      )
        throw Error();
      res.json({ url: url.href });
    } catch {
      res
        .status(503)
        .json({ error: "Billing could not be opened. Please retry shortly." });
    }
  });
  router.post("/sign-out", async (req, res) => {
    const stored = cookies(req);
    let token = stored.get(accessName);
    let revoked = !token && !stored.has(refreshName);
    if (!token && stored.get(refreshName)) {
      try {
        token = sessionSchema.parse(
          await deps.auth("token?grant_type=refresh_token", {
            refresh_token: stored.get(refreshName),
          }),
        ).access_token;
      } catch {
        /* Clearing the browser remains possible when refresh fails. */
      }
    }
    if (token) {
      try {
        await options.signOut(token);
        revoked = true;
      } catch {
        /* Clear local cookies even during an auth outage. */
      }
    }
    clear(res);
    res.json({ signedOut: true, revoked });
  });
  return router;
}
