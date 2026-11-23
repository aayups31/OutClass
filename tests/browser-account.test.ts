import { it, expect, vi, afterEach } from "vitest";
import type { Server } from "node:http";
import {
  createGateway,
  type GatewayDependencies,
} from "../services/ai/gateway";
const user = "b8a66e7b-50e0-4f9b-8e5b-24614926e490";
const origin = "https://outclass.example";
const session = {
  access_token: "access-fixture",
  refresh_token: "refresh-fixture",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  email: "learner@example.com",
};
it("requires authentication and current-password proof before a password change", async () => {
  const f = await fixture(),
    body = { currentPassword: "OldPass8!", password: "NewPass8!" },
    cookie = "__Host-outclass-access=" + session.access_token;
  expect((await f.post("change-password", body)).status).toBe(401);
  expect(
    (await f.post("change-password", body, cookie, "https://attacker.example"))
      .status,
  ).toBe(403);
  expect(
    (await f.post("change-password", { ...body, password: "short" }, cookie))
      .status,
  ).toBe(400);
  expect(f.deps.browser!.changePassword).not.toHaveBeenCalled();
  const response = await f.post("change-password", body, cookie);
  expect(response.status).toBe(200);
  expect(f.deps.auth).toHaveBeenCalledWith("token?grant_type=password", {
    email: session.email,
    password: body.currentPassword,
  });
  expect(f.deps.browser!.changePassword).toHaveBeenCalledWith(
    session.access_token,
    body.password,
  );
  expect(response.headers.getSetCookie()).toHaveLength(2);
});
it("rejects a wrong current password without updating the provider", async () => {
  const f = await fixture({
    auth: async () => {
      throw Error("wrong password");
    },
  });
  const response = await f.post(
    "change-password",
    { currentPassword: "WrongPass!", password: "NewPass8!" },
    "__Host-outclass-access=" + session.access_token,
  );
  expect(response.status).toBe(400);
  expect(f.deps.browser!.changePassword).not.toHaveBeenCalled();
});
it("requires a recovery verification before resetting and establishing cookies", async () => {
  const f = await fixture();
  expect((await f.post("recover", { email: session.email })).status).toBe(200);
  expect(f.deps.auth).toHaveBeenCalledWith("recover", { email: session.email });
  const body = { email: session.email, code: "000000", password: "NewPass8!" };
  expect((await f.post("reset-password", body)).status).toBe(400);
  expect(f.deps.browser!.changePassword).not.toHaveBeenCalled();
  const response = await f.post("reset-password", { ...body, code: "123456" });
  expect(response.status).toBe(200);
  expect(f.deps.auth).toHaveBeenCalledWith("verify", {
    email: session.email,
    token: "123456",
    type: "recovery",
  });
  expect(f.deps.browser!.changePassword).toHaveBeenCalledWith(
    session.access_token,
    body.password,
  );
  expect(response.headers.getSetCookie()).toHaveLength(2);
});
it("rejects duplicate registration without creating a browser session", async () => {
  const f = await fixture({
    auth: async () => {
      throw Object.assign(Error("duplicate"), { code: "account_exists" });
    },
  });
  const response = await f.post("register", {
    email: session.email,
    password: "Eight!42",
  });
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    error:
      "An account with this email already exists. Sign in with your password.",
  });
  expect(response.headers.getSetCookie()).toHaveLength(0);
});
it("creates credentials without a session, verifies email, and protects profile writes", async () => {
  const f = await fixture();
  expect(
    (await f.post("register", { email: session.email, password: "short" }))
      .status,
  ).toBe(400);
  const registration = await f.post("register", {
    email: session.email,
    password: "a long private passphrase",
  });
  expect(registration.status).toBe(200);
  expect(registration.headers.get("set-cookie")).toBeNull();
  expect(f.deps.auth).toHaveBeenCalledWith("signup", {
    email: session.email,
    password: "a long private passphrase",
  });
  expect(
    (
      await f.post("profile", {
        name: "Learner",
        interests: [],
        industries: [],
        learningGoals: [],
      })
    ).status,
  ).toBe(401);
  const verified = await f.post("verify", {
    email: session.email,
    code: "123456",
  });
  const cookie = verified.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  expect(
    (
      await f.post(
        "profile",
        { name: "Learner", interests: [], industries: [], learningGoals: [] },
        cookie,
      )
    ).status,
  ).toBe(200);
  expect(f.deps.browser!.profile).toHaveBeenCalledWith(session.access_token, {
    name: "Learner",
    interests: [],
    industries: [],
    learningGoals: [],
  });
});
it("accepts eight-character passwords and rejects seven-character passwords", async () => {
  const f = await fixture();
  for (const route of ["register", "password"]) {
    expect(
      (await f.post(route, { email: session.email, password: "Seven!7" }))
        .status,
    ).toBe(400);
    expect(
      (await f.post(route, { email: session.email, password: "Eight!42" }))
        .status,
    ).toBe(200);
  }
});
it("resends signup verification without enabling passwordless browser sign-in", async () => {
  const f = await fixture();
  expect((await f.post("email", { email: session.email })).status).toBe(401);
  expect(f.deps.auth).not.toHaveBeenCalled();
  expect(
    (await f.post("resend-verification", { email: session.email })).status,
  ).toBe(200);
  expect(f.deps.auth).toHaveBeenCalledWith("resend", {
    email: session.email,
    type: "signup",
  });
  expect(f.deps.auth).not.toHaveBeenCalledWith("otp", expect.anything());
});
let server: Server | undefined;
afterEach(async () => {
  if (server) await new Promise<void>((r) => server!.close(() => r()));
  server = undefined;
});
async function fixture(overrides: Partial<GatewayDependencies> = {}) {
  let profile: unknown = null;
  const deps: GatewayDependencies = {
    authenticate: async () => user,
    answer: async () => ({ answer: "Predict the result.", citations: [] }),
    auth: vi.fn(async (route, body) => {
      if (route === "otp") return { sent: true };
      if (route === "verify" && (body as any).token !== "123456")
        throw Error("invalid-code");
      return session;
    }),
    allowance: {
      reserve: async () => true,
      refund: async () => {},
      usage: async () => ({
        used: 1,
        limit: 20,
        remaining: 19,
        plan: "free",
        period: "2026-10",
      }),
    },
    checkout: vi.fn(
      async () => "https://checkout.stripe.com/c/pay/test_fixture",
    ),
    browser: {
      origin,
      preview: true,
      freeLimit: 20,
      paidLimit: 600,
      identity: vi.fn(async (token) => {
        if (token !== session.access_token) throw Error("expired");
        return { id: user, email: session.email };
      }),
      signOut: vi.fn(async () => {}),
      changePassword: vi.fn(async () => {}),
      profile: vi.fn(async (_token, value) => {
        if (value) profile = value;
        return profile;
      }),
      plan: async () => ({
        amount: 1200,
        currency: "cad",
        interval: "month",
        mode: "test",
      }),
    },
    ...overrides,
  };
  server = createGateway(deps).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server!.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const post = (
    path: string,
    body: unknown,
    cookie = "",
    requestOrigin = origin,
  ) =>
    fetch(`${base}/v1/browser/${path}`, {
      method: "POST",
      headers: {
        Origin: requestOrigin,
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify(body),
    });
  const get = (path: string, cookie = "") =>
    fetch(`${base}/v1/browser/${path}`, { headers: { Cookie: cookie } });
  return { deps, post, get };
}
it("signs in with password and saves only validated profile preferences", async () => {
  const f = await fixture(),
    credentials = {
      email: session.email,
      password: "a long private passphrase",
    };
  const signed = await f.post("password", credentials);
  expect(signed.status).toBe(200);
  expect(JSON.stringify(await signed.json())).not.toContain(
    session.access_token,
  );
  const cookie = "__Host-outclass-access=" + session.access_token,
    profile = {
      name: "Aayu",
      interests: ["Programming"],
      learningGoals: ["Build a useful app"],
      industries: ["Education"],
    };
  expect(
    (await f.post("profile", { ...profile, role: "admin" }, cookie)).status,
  ).toBe(400);
  expect(
    (await f.post("profile", profile, cookie, "https://attacker.example"))
      .status,
  ).toBe(403);
  expect((await f.post("profile", profile, cookie)).status).toBe(200);
  expect(await (await f.get("profile", cookie)).json()).toEqual({ profile });
});
it("rejects failed password authentication without setting cookies", async () => {
  const f = await fixture({
    auth: async () => {
      throw Error("private provider details");
    },
  });
  const response = await f.post("password", {
    email: session.email,
    password: "a long incorrect passphrase",
  });
  expect(response.status).toBe(400);
  expect(response.headers.getSetCookie()).toHaveLength(0);
  expect(await response.text()).not.toContain("private provider details");
});
it("ignores malformed profile metadata instead of exposing unvalidated fields", async () => {
  const f = await fixture();
  f.deps.browser!.profile = async () => ({
    name: "Learner",
    role: "admin",
    learningGoals: "invalid",
  });
  const response = await f.get(
    "profile",
    "__Host-outclass-access=" + session.access_token,
  );
  expect(await response.json()).toEqual({ profile: null });
});
it("sets verified, secure, HttpOnly session cookies and never exposes tokens to browser JSON", async () => {
  const f = await fixture();
  expect(await (await f.get("config")).json()).toMatchObject({
    preview: true,
    freeLimit: 20,
    paidLimit: 600,
    plan: { mode: "test", amount: 1200 },
  });
  const r = await f.post("verify", { email: session.email, code: "123456" });
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ authenticated: true, email: session.email });
  const saved = r.headers.getSetCookie();
  expect(saved).toHaveLength(2);
  for (const cookie of saved) {
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/");
  }
  expect(r.headers.get("cache-control")).toBe("private, no-store");
  const cookie = saved.map((value) => value.split(";")[0]).join("; ");
  expect(await (await f.get("session", cookie)).json()).toMatchObject({
    authenticated: true,
    email: session.email,
    usage: { remaining: 19 },
  });
  const checkout = await f.post(
    "checkout",
    { user_id: "someone-else" },
    cookie,
  );
  expect(checkout.status).toBe(200);
  expect(f.deps.checkout).toHaveBeenCalledWith(user);
  expect(await (await f.get("session")).json()).toEqual({
    authenticated: false,
  });
});
it("rejects cross-origin mutations, invalid codes, unauthenticated checkout and non-Stripe billing links", async () => {
  const f = await fixture({
    checkout: async () => "https://malicious.example/pay",
  });
  expect(
    (
      await f.post(
        "email",
        { email: session.email },
        "",
        "https://malicious.example",
      )
    ).status,
  ).toBe(403);
  expect(f.deps.auth).not.toHaveBeenCalled();
  expect(
    (await f.post("verify", { email: session.email, code: "000000" })).status,
  ).toBe(400);
  expect((await f.post("checkout", {})).status).toBe(401);
  const r = await f.post(
    "checkout",
    {},
    `__Host-outclass-access=${session.access_token}`,
  );
  expect(r.status).toBe(503);
  expect(await r.text()).not.toContain("malicious");
});
it("refreshes expired tokens before trusting identity and keeps sessions isolated", async () => {
  const f = await fixture();
  const r = await f.get(
    "session",
    `__Host-outclass-access=expired; __Host-outclass-refresh=${session.refresh_token}`,
  );
  expect(await r.json()).toMatchObject({
    authenticated: true,
    email: session.email,
  });
  expect(f.deps.auth).toHaveBeenCalledWith("token?grant_type=refresh_token", {
    refresh_token: session.refresh_token,
  });
  expect(r.headers.getSetCookie()).toHaveLength(2);
  expect(await (await f.get("session")).json()).toEqual({
    authenticated: false,
  });
});
it("sign-out revokes only this provider session and clears both browser cookies", async () => {
  const f = await fixture();
  const r = await f.post(
    "sign-out",
    {},
    `__Host-outclass-access=${session.access_token}; __Host-outclass-refresh=${session.refresh_token}`,
  );
  expect(await r.json()).toEqual({ signedOut: true, revoked: true });
  expect(f.deps.browser!.signOut).toHaveBeenCalledWith(session.access_token);
  expect(
    r.headers
      .getSetCookie()
      .every((cookie) => cookie.includes("Expires=Thu, 01 Jan 1970")),
  ).toBe(true);
});
it("fails closed when provider identity disagrees with a returned login session", async () => {
  const f = await fixture();
  f.deps.browser!.identity = async () => {
    throw Error("not verified");
  };
  const response = await f.post("verify", {
    email: session.email,
    code: "123456",
  });
  expect(response.status).toBe(400);
  expect(response.headers.getSetCookie()).toHaveLength(0);
});
it("retains cookies during an identity-provider outage instead of signing the learner out", async () => {
  const f = await fixture();
  f.deps.browser!.identity = async () => {
    throw Object.assign(Error("temporary outage"), { status: 503 });
  };
  const response = await f.get(
    "session",
    `__Host-outclass-access=${session.access_token}; __Host-outclass-refresh=${session.refresh_token}`,
  );
  expect(response.status).toBe(503);
  expect(response.headers.getSetCookie()).toHaveLength(0);
  expect(f.deps.auth).not.toHaveBeenCalled();
});
it("revokes a refresh-only session when the access cookie has expired", async () => {
  const f = await fixture();
  const response = await f.post(
    "sign-out",
    {},
    `__Host-outclass-refresh=${session.refresh_token}`,
  );
  expect(await response.json()).toEqual({ signedOut: true, revoked: true });
  expect(f.deps.browser!.signOut).toHaveBeenCalledWith(session.access_token);
});
