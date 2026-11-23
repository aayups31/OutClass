# Academy engineering readiness

For the November 23 full-course implementation and current evidence/limits, see [Academy course-production engineering](academy-engineering-completion.md). The dated pass below is historical; its attachment and generator limitations are superseded by that report.

This records the November 21, 2026 quality pass. It describes verified behavior, not a certification of teaching quality or a substitute for learner trials.

## Implemented in this pass

- Atlas and Forge use the audience, selected lesson, project increment and surrounding curriculum when designing practice. Earlier objectives are not treated as demonstrated mastery. A large outline is explicitly marked as partial, with bounded excerpts.
- The agent instructions ask for direct, specific language, a small first success, diagnostic hints, concrete examples, observable checks and one changed requirement. Missing source material and extra setup must be disclosed. These instructions guide generation; they do not guarantee a model will produce excellent teaching.
- Teaching review now surfaces missing practice examples, a single-step hint ladder and a capstone with no starter files. Instructors still inspect and approve the exact revision.
- Attachment reads check the stored size and SHA-256. Re-uploading the original repairs a missing or damaged file without breaking its lesson references. Video range requests still work, and Unicode starter limits count characters.
- The workbench offers a complete teaching example: three linked Python lessons that develop a club organizer's weekly report. Each includes a worked reasoning example, practice contract, incomplete starter, runnable checks, progressive hints, evidence reflection and transfer challenge. Downloading it does not change a saved course.

## Verification evidence

- Production build passed, including TypeScript, the desktop bundles, workspace, companion extension and editor extension.
- Academy authoring, resources, agent work and teaching example: 29 automated tests passed after the added large-curriculum test.
- Releases, Learn delivery, learning paths, compiler and handoffs: 18 automated tests passed. The additional hosted database integration test passed against the configured database in a rollback-only transaction, verifying account isolation, immutable releases, enrollment and single-use launch grants. Its first attempt hit the old 30-second overall limit; the controlled rerun passed with per-query time limits, progress reporting and a longer overall network-test budget. That is 48 distinct automated tests across this pass.
- Three browser journeys passed: authoring through Learn delivery; agent proposal/review/apply/restore; and teaching-example download/import/review/release/capstone preview.
- The example's Python checks run against incomplete starters, test-only correct implementations and plausible incorrect implementations. Correct versions pass; incomplete and incorrect versions fail as intended. Reference solutions are not shipped in learner starter files.

The browser agent journeys use controlled model responses. They establish the workflow and data boundaries, not live-model pedagogy or hallucination rates. The compiler verifies its specific built-in Python API template, not arbitrary generated code.

## Remaining release limits

- Hosted publishing still rejects local file attachments. Course JSON exports carry file references, not the binary attachments; they are not a portable media backup.
- A full hosted browser trial with real sign-in and the packaged Windows app is still required. The direct database integration test does not establish every HTTP, browser-authentication or installer boundary.
- Live providers need evaluation on actual instructor material: accuracy, difficulty fit, hint usefulness, unsupported assumptions and spoiler avoidance.
- Learners and educators need to try the course without author guidance. Observe where they hesitate, what misconceptions survive and whether transfer tasks show independent understanding.
- These changes are source commits and a successful production build. This pass did not publish a new downloadable Windows installer or imply that previously downloaded installers contain the fixes.

## Repeat the focused checks

```text
npm run build
npx vitest run tests/academy-example.test.ts tests/academy-studio.test.ts tests/academy-resources.test.ts tests/agent-work.test.ts
npx vitest run tests/academy-hosted.test.ts tests/academy-compiler.test.ts tests/learn-delivery.test.ts tests/expansion.test.ts tests/product-agents.test.ts tests/learning-path.test.ts tests/agent-handoffs.test.ts
npx playwright test tests/e2e/expansion.spec.ts tests/e2e/agent-work.spec.ts
```
