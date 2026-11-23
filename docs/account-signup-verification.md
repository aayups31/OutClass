# Account signup verification

The account page supports email/password signup, numeric email verification, and
an editable learning profile (name, interests, learning goals, and industries).
Existing email-code sign-in and password sign-in remain available. Preferences
are Supabase user metadata, never authorization or billing claims.

## Automated checks

- `npx vitest run tests/browser-account.test.ts tests/ai-gateway.test.ts`
- `npx playwright test --config playwright.account.config.ts`
- `npm run check`
- `npm run build:site`
- `npm run build:ai`

Browser tests cover desktop and mobile signup, invalid-code recovery, profile
saving/reloading/editing, refreshing allowance without discarding edits, password
sign-in failure and recovery, sign-out, and legacy email-code sign-in. Browser API
tests cover unauthenticated and cross-origin writes, bounded strict profile
validation, invalid metadata, secure cookies, refresh, and provider failures.
Browser tests use mocked provider responses; API tests use an injected identity
provider. They do not prove real email delivery.

## Live configuration and remaining external check

On November 23, 2026, the project's public Supabase Auth settings returned email
authentication enabled, signup enabled, and automatic email confirmation disabled.
No existing account password or entitlement was changed for these tests.

The user requested retaining Resend's built-in test sender. It only delivers to
the connected owner address, so public new-user email delivery is still blocked.
Before public signup, configure an OutClass sender domain and ensure Supabase's
**Confirm signup** email template includes `{{ .Token }}` for the numeric code.
Then verify a fresh real account from signup through email receipt, verification,
profile save, sign-out, and password sign-in. This external check has not been
represented as an automated pass.
