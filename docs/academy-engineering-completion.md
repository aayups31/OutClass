# Academy course-production engineering

November 23, 2026. This is the implementation follow-up to [the 32-gap audit](academy-full-course-audit.md). That audit remains a historical baseline. The following ten workstreams have working implementations and automated checks. The final large-transfer migration was applied to the configured production database after explicit user approval; the hosted transfer, enrollment, grading and account-isolation checks passed against the migrated database in a rolled-back synthetic transaction.

| Workstream                              | Delivered behavior                                                                                                                                                                                                                                                                         | Audit coverage         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| Permissioned research                   | Versioned HTML/text/PDF/transcript ingestion; hashes, attribution, resource permission records, expiry/revocation, full-text passage retrieval with level/topic/prerequisite filters, literal quote validation, affected-course review invalidation and inactive-by-default backup restore | A01–A04, A29           |
| Course design                           | Structured audience, entry skills, constraints, exclusions, time and final deliverable; stable outcomes, glossary, skill ordering, dependency plan, environment, project interfaces and milestone acceptance                                                                               | A05–A07, A09, A14, A17 |
| Substantive teaching                    | Separate explanations, annotated worked examples, misconceptions, supported practice, independent work, transfer, summaries, assumptions, source evidence and bounded lesson context                                                                                                       | A08, A10–A11           |
| Editorial control and accessible assets | Manual plan/lesson repair, before/after history, instructor feedback, section locks across regeneration, explicit critic dispositions, typed tables/equations/diagrams/media, captions/transcripts and readable alternatives                                                               | A12–A13, A24           |
| Project verification                    | Generated Python/JavaScript assignments run in isolated Docker or Vercel machines; correct reference must pass, starter and deliberate mutation must fail; tests must actually run; evidence is tied to exact files/runtime                                                                | A15–A18                |
| Assessment and self-learning evidence   | Private answer banks; typed diagnostic/retrieval/application/transfer items; answer-specific feedback, review schedules, remediation links, exact-release submissions, saved-file hashes, rubric evidence and isolated student checks; self-review stays distinct from automatic checks    | A19–A22                |
| Durable production                      | Explicit provider-call budget, accepted syllabus before generation, per-stage checkpoints, restart/cancel recovery, private failed-candidate retention, stale revision guards, bounded retries and separately stored workshop records                                                      | A07, A13, A31          |
| Release integrity and portable storage  | Exact-revision guided review for publication; preview distinguished from reviewed publication; 6 million character course budget, content-addressed lessons, immutable releases, separately scoped media, public/private backups, portable media folders and historical draft restore      | A25–A28                |
| Learner upgrades                        | Releases stay pinned; explicit comparison and stable lesson mapping; reviewed file snapshots, interrupted-copy recovery, conflicts preserved for manual merging, original folders and assessment/progress evidence retained                                                                | A30                    |
| Evaluations and acceptance gates        | Original benchmark briefs, opt-in live generation/repair/isolated checks with model and prompt records, clean-workspace acceptance runner, embedded PostgreSQL production-schema/RLS tests, oversized interrupted transfer checks, browser journeys and Windows/Linux GitHub CI            | A23, A24, A31–A32      |

## Evidence from this implementation

- The complete local suite passed **245 tests across 46 files** with no failures. Subsequent focused checks also passed the added runtime-version mismatch and hosted-image dependency checks. The service dependency audit reports **zero vulnerabilities** after compatible lockfile updates; this is separate from desktop packaging advisories.

- An original **six-lesson Python reporting course** was generated with `gpt-5.4-2026-03-05`, repaired from actual technical/editorial findings, and independently critiqued. All six current lessons passed isolated reference/starter/mutation checks on Python **3.12.16**. The last editorial pass returned **zero blockers**. Earlier failed versions remain evidence: generated tests initially missed fixtures and weak or contradictory tasks needed correction. This is a successful repaired course, not a first-pass success-rate claim.
- The final artifact completed the acceptance runner: workshop delivery → exact-revision review/release → private portable backup → clean author restore → every lesson opened in Learn → scoped hosted PostgreSQL publication/enrollment → fresh learner download → private server grading. No provider calls or production writes occur during that replay. Existing isolated verification receipts are validated against the current lesson contents.
- A separate **80-lesson Unicode fixture exceeds 4.5 MB**. Its desktop publication and download clients passed forced upload/download interruptions, repeated chunks, one-time grant consumption, complete hash comparison and lineage preservation. Each transferred request/response stays below the host payload cap.
- The full production desktop/workspace/extension build and the hosted service build pass. Four browser journeys pass: course workshop, grounded agent review/apply/restore, author-to-Learn delivery, and teaching-example import/release/capstone preview.
- Hosted schema tests use real PostgreSQL semantics in an in-memory PGlite instance with `outclass_api NOBYPASSRLS`. They apply the actual schema/migration files and verify owner/enrolled/unrelated access, private staging, immutable publication, grading and grants. A separate opt-in test targets the configured live database inside a rollback-only transaction. No production DDL is attempted by that test.

Private generated instructor answers, raw provider outputs, keys, tokens and sandbox logs stay under ignored `.local/`. They are not committed or uploaded as CI artifacts. The fixture CI journey explicitly identifies its controlled model and runtime receipts; it is not live-model teaching-quality evidence.

## Supported limits and configuration

- A saved/imported course supports **200 lessons**, **40,000 characters of primary teaching text per lesson** and **6,000,000 total course characters**. The raw import envelope has a separate escaping/formatting allowance. Full-course generation uses **3–40 planned lessons** and at most **100 explicitly approved provider calls** per workshop. Split larger curricula into course modules.
- Source ingestion is permissioned, not a blanket university-content scrape. The existing MIT/Stanford/CMU discovery catalog is metadata, not an imported or licensed corpus. Import approved material with resource-specific permission and location records. Literal-quote checks establish traceability; an educator still judges whether a claim is supported and taught well.
- Automatic code verification supports Python and JavaScript. Other languages remain explicitly unverified. Docker requires a configured digest-pinned image; Vercel Sandbox requires its normal project authentication and `OUTCLASS_SANDBOX_BACKEND=vercel`. Remote machines receive the assignment files, have network disabled before untrusted code runs, and are stopped after bounded execution. There is no unrestricted host execution fallback.
- Local resources: **80 MB per file**, **1 GB library allowance**. Hosted resources: **500 MB per creator**. Small JSON portable backups support up to **100 MB** of media; portable folders stream separate assets through the browser file API. A folder manifest is written last and each export gets a unique subfolder. Browser support is detected and the JSON alternative is explained.
- Large publications use private **240,000-byte chunks**, a **48 MB transfer budget**, a **100 MB unfinished-transfer allowance** and **seven-day staging expiry**. Successfully published staging bytes are deleted while a small idempotent receipt remains. Downloaded lessons are checked against immutable content hashes; successful lesson downloads survive a dropped connection and do not require consuming another grant. Small publications retain the existing direct route for deployment compatibility.
- Independent review does not guarantee excellent teaching. Repeated full-course evaluations across every configured provider, factual subject review and unaided learner/educator trials remain the basis for reliability or learning-effectiveness claims. The case matrix and explicit evaluation commands make those comparisons repeatable; one repaired sample does not establish a rate.

## Repeat the gates

```powershell
npm test
npm run build
npm run build:ai
npx tsx scripts/accept-course-workshop.ts --fixture
npx playwright test tests/e2e/course-workshop.spec.ts tests/e2e/expansion.spec.ts tests/e2e/agent-work.spec.ts

# Opt-in live-model evaluation. The configured account is charged for provider calls.
$env:OUTCLASS_EVAL_MODEL = '<exact configured model ID>'
npx tsx scripts/evaluate-course-workshop.ts --live --case volunteer-reports
npx tsx scripts/verify-course-workshop.ts --job .local/academy-evaluations/<id>.json --live-sandbox
npx tsx scripts/repair-course-workshop.ts --job .local/academy-evaluations/<id>.json --live --editorial
npx tsx scripts/accept-course-workshop.ts --job .local/academy-evaluations/<id>.json

# Optional existing hosted-schema integration test; all synthetic changes roll back.
$env:OUTCLASS_DATABASE_TEST = '1'
npx vitest run tests/academy-hosted.test.ts
```

Inspect `scripts/academy-evaluation-cases.json` for additional original briefs and review criteria. Live generation and VM execution are opt-in; ordinary CI has no provider credentials or production database writes.

## Production migration and release state

The reviewed [transfer migration](../supabase/migrations/20261123010300_academy_transfers.sql) is **applied** to hosted project `wdfitadfokxvulfbkcvd`. It adds owner-only temporary publication staging, indexes and larger bounded JSON storage constraints. It does not modify published course contents or grant learners access to private grading material. Automatic approval review initially required explicit approval; the user then approved this exact production migration. Post-migration policy inspection verified explicit transfer ownership, and both local and real hosted isolation/transfer tests passed. Synthetic integration-test data was rolled back. The deployed service readiness endpoint returned HTTP 200.

The media, private assessment and lesson-content schemas preceding it were already applied during this work; their reproducible SQL is now also tracked under `supabase/migrations`. A new downloadable Windows installer has not been published by this engineering pass. Deployed HTTP/authentication, installer and real educator/learner verification must use the actual release artifact and configured services; source/build checks do not establish those production boundaries.
