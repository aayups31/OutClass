import { it, expect, afterEach, vi } from "vitest";
import type { Server } from "node:http";
import { InvalidBillingSignature } from "../services/ai/billing";
import {
  createGateway,
  type GatewayDependencies,
} from "../services/ai/gateway";
const user = "b8a66e7b-50e0-4f9b-8e5b-24614926e490";
let server: Server | undefined;
afterEach(async () => {
  if (server) await new Promise<void>((r) => server!.close(() => r()));
  server = undefined;
});
async function fixture(overrides: Partial<GatewayDependencies> = {}) {
  let used = 0;
  const deps: GatewayDependencies = {
    allowance: {
      reserve: vi.fn(async () => {
        if (used >= 1) return false;
        used++;
        return true;
      }),
      refund: vi.fn(async () => {
        used--;
      }),
      usage: async () => ({
        used,
        limit: 1,
        remaining: 1 - used,
        period: "2026-10",
        plan: "free",
      }),
    },
    authenticate: vi.fn(async (token) => {
      if (token !== "valid-account") throw new Error("Bad token");
      return user;
    }),
    answer: vi.fn(async () => ({
      answer: "What result do you expect?",
      citations: [],
    })),
    auth: vi.fn(async () => ({ sent: true })),
    ...overrides,
  };
  server = createGateway(deps).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server!.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  return {
    deps,
    base,
    post: (route: string, body: unknown, token = "valid-account") =>
      fetch(base + route, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      }),
    get: (route: string) =>
      fetch(base + route, {
        headers: { Authorization: "Bearer valid-account" },
      }),
  };
}
it("advertises the task contract without inference or account secrets", async () => {
  const f = await fixture();
  const response = await fetch(f.base + "/health");
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    ok: true,
    contractVersion: 2,
    tasks: expect.arrayContaining(["work", "teacher", "promotion"]),
  });
  expect(f.deps.answer).not.toHaveBeenCalled();
});
it("requires a verified account, reserves allowance before inference and blocks overspending", async () => {
  const f = await fixture(),
    input = { task: "teacher", context: "Course material", history: [] };
  expect((await f.post("/v1/answer", input, "invalid")).status).toBe(401);
  expect(f.deps.answer).not.toHaveBeenCalled();
  expect((await f.post("/v1/answer", input)).status).toBe(200);
  expect((await f.post("/v1/answer", input)).status).toBe(402);
  expect(f.deps.answer).toHaveBeenCalledTimes(1);
  expect(await (await f.get("/v1/usage")).json()).toMatchObject({
    remaining: 0,
  });
});
it("reports email-delivery failures without exposing SMTP credentials", async () => {
  const f = await fixture({
    auth: vi.fn(async () => {
      throw Error("private SMTP password");
    }),
  });
  const invalid = await f.post("/v1/auth/email", { email: "invalid" });
  expect(invalid.status).toBe(400);
  expect(f.deps.auth).not.toHaveBeenCalled();
  const failed = await f.post("/v1/auth/email", {
    email: "learner@example.com",
  });
  expect(failed.status).toBe(503);
  const body = await failed.text();
  expect(body).toContain("email could not be sent");
  expect(body).not.toContain("SMTP");
  expect(body).not.toContain("password");
});
it("passes the exact raw Stripe payload and distinguishes invalid signatures from retryable failures", async () => {
  const webhook = vi.fn(async (_body: Buffer, _signature: string) => {});
  const f = await fixture({ webhook });
  const raw = '{ "event": "untouched whitespace" }';
  const send = () =>
    fetch(f.base + "/v1/stripe/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": "signed",
      },
      body: raw,
    });
  expect((await send()).status).toBe(200);
  expect(webhook).toHaveBeenCalledWith(Buffer.from(raw), "signed");
  webhook.mockRejectedValueOnce(new InvalidBillingSignature());
  expect((await send()).status).toBe(400);
  webhook.mockRejectedValueOnce(Error("Private database failure"));
  const result = await send();
  expect(result.status).toBe(503);
  expect(await result.text()).not.toContain("Private");
});
it("refunds a failed or malformed model answer and rejects arbitrary proxy tasks", async () => {
  const f = await fixture({
    answer: vi.fn(async () => {
      throw new Error("Provider secret error");
    }),
  });
  const result = await f.post("/v1/answer", {
    task: "teacher",
    context: "lesson",
    history: [],
  });
  expect(result.status).toBe(503);
  expect(await result.text()).not.toContain("secret");
  expect(f.deps.allowance.refund).toHaveBeenCalledOnce();
  expect(
    (await f.post("/v1/answer", { task: "arbitrary-tool", context: "lesson" }))
      .status,
  ).toBe(400);
});
it("rejects concurrent answers for one account and leaves billing unavailable until configured", async () => {
  let finish!: (v: any) => void;
  const f = await fixture({
    answer: () =>
      new Promise((r) => {
        finish = r;
      }),
  });
  const first = f.post("/v1/answer", {
    task: "teacher",
    context: "lesson",
    history: [],
  });
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  expect(
    (
      await f.post("/v1/answer", {
        task: "teacher",
        context: "lesson",
        history: [],
      })
    ).status,
  ).toBe(429);
  finish({ answer: "One hint", citations: [] });
  expect((await first).status).toBe(200);
  expect((await f.post("/v1/checkout", {})).status).toBe(503);
});
it("does not push an upgrade when the service capacity is exhausted but the learner has credit", async () => {
  const f = await fixture();
  vi.mocked(f.deps.allowance.reserve).mockResolvedValue(false);
  const response = await f.post("/v1/answer", {
    task: "teacher",
    context: "lesson",
    history: [],
  });
  expect(response.status).toBe(503);
  expect(await response.text()).toContain("service capacity");
  expect(f.deps.answer).not.toHaveBeenCalled();
});
it("handles passwordless sign-in without returning or storing the provider API key", async () => {
  const f = await fixture();
  expect(
    (await f.post("/v1/auth/email", { email: "learner@example.com" })).status,
  ).toBe(200);
  expect(f.deps.auth).toHaveBeenCalledWith("otp", {
    email: "learner@example.com",
    create_user: true,
  });
  expect(
    (
      await f.post("/v1/auth/verify", {
        email: "learner@example.com",
        code: "bad",
      })
    ).status,
  ).toBe(400);
});
it("treats malformed model output as a service failure, refunds it and allows another attempt", async () => {
  const f = await fixture({
    answer: vi
      .fn()
      .mockResolvedValue({ answer: "Incomplete provider response" }),
  });
  const input = { task: "teacher", context: "lesson", history: [] };
  expect((await f.post("/v1/answer", input)).status).toBe(503);
  expect(f.deps.allowance.refund).toHaveBeenCalledOnce();
  vi.mocked(f.deps.answer).mockResolvedValue({
    answer: "What result do you predict?",
    citations: [],
  });
  expect((await f.post("/v1/answer", input)).status).toBe(200);
});
