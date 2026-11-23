# Academy release verification — November 23, 2026

## Windows installers

Both Windows x64 NSIS installers were built and tested on a fresh GitHub Windows runner, not merely a fresh profile on the development machine. The [clean-runner verification](https://github.com/aayups31/OutClass/actions/runs/45229233706) passed for OutClass Learn and OutClass Educator: silent installation, launch of the installed executable, Windows-encrypted account persistence across restart, sign-out and silent uninstallation. The account endpoint in this installer smoke test is a controlled fixture; the real deployed service was verified separately below.

Local release candidates are under `dist/releases/learn` and `dist/releases/educator`; the clean-runner installers are attached to that workflow run as a fourteen-day artifact. No existing public GitHub release asset was overwritten. Both executables remain unsigned preview builds, as configured by the project.

| Local release candidate           | SHA-256                                                            |
| --------------------------------- | ------------------------------------------------------------------ |
| OutClass-Learn-Setup-0.8.0.exe    | `512b3ddfb0500f9e5679716b3ce3fa7863099edd452b6ca9b099255a4a87f47e` |
| OutClass-Educator-Setup-0.8.0.exe | `c3943904f7850b7e7adae0ff4e8e4c70f4cc20d09ec17fe18e53c33d4012ab34` |

These hashes describe the local builds. Independently rebuilt CI artifacts can have different installer hashes.

## Deployed service

The real service at `https://git-learn-black.vercel.app` passed the opt-in `scripts/verify-academy-deployed.ts` journey using real email OTP authentication and a real session refresh. No signing keys, administrator impersonation, mocked identity or direct database writes were used for the successful journey.

The authenticated account was used in two fresh local workspaces. The test briefly published an original synthetic three-lesson course, then verified:

- Media upload interrupted after the first chunk and successfully resumed.
- Exact-revision reviewed publication and explicit enrollment.
- One-use launch-code redemption followed by an intentionally interrupted lesson download; retry reused the local receipt rather than redeeming twice.
- Byte-for-byte restored media and private answer keys absent from the downloaded client store.
- Real hosted private assessment grading.
- Local sign-out clearing account access.
- Withdrawal of the temporary synthetic course after the run.

Live testing found and fixed a production defect: all authenticated Academy transfer requests had shared the twelve-per-minute inference limit. `7452ba8` separates inference, course-transfer and other account-operation budgets. Its regression test verifies that transfer traffic cannot consume the inference budget and that inference still stops at its own limit. The successful deployed journey ran after this fix reached the production deployment.

## Explicitly deferred email boundary

The user chose to retain Resend's built-in testing sender and configure an OutClass domain later. That sender only delivers to the Resend owner's exact email address. A separate Gmail alias was rejected by the SMTP provider; Supabase auth logs confirmed the restriction. No verified domain belonging to another product was used, and SMTP settings were left unchanged.

Consequently the live journey used **one real account in two workspaces**. It does not establish successful signup/email delivery for a second independent account or for the public. Cross-account database isolation has separate automated coverage, but it is not a substitute for that missing email-delivery test. General-user sign-in and a two-account deployed acceptance run remain release gates until the OutClass sending domain is configured.

Real educator and unaided learner trials remain separate human evaluations. A clean Windows runner validates installation mechanics; it does not establish SmartScreen reputation, signing trust or behavior on every customer machine.
