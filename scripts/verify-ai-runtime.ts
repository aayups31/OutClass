// Real database/runtime smoke test. Optional OUTCLASS_VERIFY_URL targets the deployed origin.
// Never sends an email, learner code, or a model request.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { parse } from "dotenv";
import Stripe from "stripe";
import { createRuntime } from "../services/ai/runtime.js";

const env = parse(await readFile(".local/ai-service.env", "utf8"));
assert.ok(env.STRIPE_SECRET_KEY.startsWith("sk_test_"), "Test mode required.");
const remote = process.env.OUTCLASS_VERIFY_URL;
if (remote)
  assert.equal(new URL(remote).origin, new URL(env.OUTCLASS_PUBLIC_URL).origin);
const runtime = remote ? undefined : await createRuntime(env);
const server = runtime?.app.listen(0, "127.0.0.1");
if (server)
  await new Promise<void>((resolve) => server.once("listening", resolve));
const base =
  remote || `http://127.0.0.1:${(server!.address() as { port: number }).port}`;
const checks: string[] = [];
async function get(path: string, status: number, fragment?: string) {
  const response = await fetch(base + path, {
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, status, path);
  if (fragment) assert.ok((await response.text()).includes(fragment), path);
  checks.push(path);
  return response;
}
try {
  await get("/health", 200, '"work"');
  await get("/ready", 200, '"ok":true');
  await get("/v1/usage", 401);
  await get("/billing/success", 200, "Refresh allowance");
  await get("/billing/cancel", 200, 'data-billing-result="cancel"');
  const css = await get("/billing/style.css", 200, "color-scheme:dark");
  assert.ok(css.headers.get("content-type")?.includes("text/css"));
  await get("/billing/unknown", 404);
  const malformed = await fetch(base + "/v1/auth/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"email":"invalid"}',
  });
  assert.equal(malformed.status, 400);
  checks.push("invalid auth request rejected without sending email");
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  // The unknown customer is intentionally ignored; whitespace proves exact raw-byte preservation.
  const payload = JSON.stringify(
    {
      id: `evt_outclass_smoke_${randomUUID()}`,
      type: "invoice.paid",
      livemode: false,
      data: { object: { customer: `cus_outclass_unknown_${randomUUID()}` } },
    },
    null,
    2,
  );
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: env.STRIPE_WEBHOOK_SECRET,
  });
  for (const [body, expected] of [
    [payload, 200],
    [payload + " ", 400],
  ] as const) {
    const result = await fetch(base + "/v1/stripe/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": signature,
      },
      body,
      signal: AbortSignal.timeout(30000),
    });
    assert.equal(result.status, expected, "Raw Stripe signature verification");
  }
  checks.push("untouched webhook accepted; changed bytes rejected");
  const report = {
    at: new Date().toISOString(),
    target: remote ? "deployed" : "local",
    passed: true,
    checks,
  };
  await writeFile(
    `.local/ai-runtime-${remote ? "deployed" : "local"}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} catch (error) {
  console.error(
    error instanceof assert.AssertionError
      ? error.message
      : "Runtime smoke test failed.",
  );
  process.exitCode = 1;
} finally {
  if (server)
    await new Promise<void>((resolve) => server.close(() => resolve()));
  await runtime?.pool.end();
}
