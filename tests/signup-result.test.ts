import { expect, it } from "vitest";
import { signupResult } from "../services/ai/signup-result";

it("recognizes an obfuscated duplicate signup in either response shape", () => {
  for (const result of [{ identities: [] }, { user: { identities: [] } }]) {
    expect(() => signupResult(result)).toThrow("Account already exists");
  }
});
it("accepts a new identity without exposing user data", () => {
  expect(signupResult({ identities: [{ provider: "email" }] })).toEqual({
    sent: true,
  });
});
