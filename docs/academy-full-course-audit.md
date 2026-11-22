# Academy full course capability audit

Audited November 22, 2026, against source revision `d63edb5`. Academy can organize instructor material, improve individual assignments, draft scaffolds, record source excerpts, and deliver reviewed releases into Learn. It does not yet provide a complete process for researching, designing, writing and validating a substantial course.

The 32 gaps below are implementable or testable without recruiting learners. They include missing capabilities, partially implemented capabilities, and two reproduced engineering issues. Completing them would establish a stronger engineering and content-production standard; it would not establish learning effectiveness without later learner evidence. This audit changes no application behavior.

## Existing capabilities to preserve

- Course and lesson editing, Markdown/JSON import, local draft recovery, chapters, prerequisite indices and project milestones.
- Atlas assignment revision and Forge exercise/capstone scaffolds, with source snapshots, bounded provider calls, explicit application and stale-revision checks.
- Approved reference excerpts with attribution, selected-lesson retrieval, citation ID validation and learner acknowledgments.
- Teaching coverage findings, exact-revision guided review receipts, immutable releases and separate instructor previews.
- Local video/PDF/archive/code attachments with integrity checks and repair; starter-file delivery that preserves learner edits.
- A three-lesson teaching example with executable checks; a separately verified, fixed Python API template.

Generic Learn project guidance, execution evidence and teacher debugging support already exist. The missing assessment and adaptation capabilities below concern Academy-authored courses and their authoring contracts, rather than claiming those other product features are absent.

## Confirmed engineering issues

### Export and import limits disagree

An executable probe constructed a schema-valid course whose compact representation was 299,950 characters and passed release validation. The workbench's pretty-printed export format produced 300,628 characters. Import rejected it because the raw input text is limited to 300,000 characters. A supported course can therefore fail to round-trip through its own export.

Relevant code: [importAcademy](../src/server/academy-studio.ts), [workbench download](../src/ui/academy-workbench.tsx), [release size validation](../src/server/expansion.ts). Completion requires defining transport limits separately from content budgets and testing actual UI export files at the boundaries, including escaped text and Unicode.

### Guided review is not a universal release requirement

An executable probe saved a course with a missing-hint review finding and no review receipt. `Expansion.release` still created the release. The guided `AcademyStudio.release` checks receipts, while the older local release route retains structural validation only. The hosted publish path also validates course structure rather than requiring the guided review receipt.

Relevant code: [AcademyStudio.release](../src/server/academy-studio.ts), [Expansion.release and routes](../src/server/expansion.ts), [hosted publication](../services/ai/academy.ts). This is an authenticated product-policy inconsistency, not a demonstrated authentication bypass. Decide whether draft/preview releases remain permitted; distinguish them from quality-reviewed published courses and enforce the chosen policy on every publishing entry point.

## Research and evidence

| ID | Gap and current boundary | Completion check without learner trials |
| --- | --- | --- |
| A01 | Permissioned research ingestion. The 19-course catalog contains discovery metadata; excerpts are pasted manually. No large ingested collection exists. | Import approved HTML/text/PDF/transcript collections with author, resource license, version, location and content hash. Deduplicate and quarantine malformed material. Do not treat public access as reuse permission. Permission acquisition itself remains an external dependency. |
| A02 | Retrieval depth and relevance. Selection uses substring matches over attached readings, then bounded passages, with at most three readings per task. It is not a broad research index. | Search a persistent collection with topic, level and prerequisite filters. Preserve section/page/time locations. Evaluate relevance, empty results, conflicting sources and context budgets against fixed query cases. A semantic index is an implementation option, not proof of relevance. |
| A03 | Claim-level grounding. Validators establish that a cited ID exists, not that its passage supports the statement. | Link substantive claims to passages; distinguish source facts from original examples and assumptions. Test unsupported claims, misleading citations, disagreement and omitted qualifications. Keep uncertain findings visible for review. |
| A04 | Source governance and updates. Approval is an instructor assertion; it does not check a grant or track changing remote content automatically. | Maintain resource-specific permission records, version history, expiry/recheck status and affected-course links. Detect changed or removed sources and invalidate dependent reviews where appropriate. Keep third-party exceptions separate from a site's general license. |

Evidence: [reference contract](../src/academy-reference-contract.ts), [catalog](../src/academy-source-catalog.ts), [retrieval](../src/server/academy-references.ts), [reference editor](../src/ui/academy-references.tsx).

## Course design and authoring

| ID | Gap and current boundary | Completion check without learner trials |
| --- | --- | --- |
| A05 | A structured course brief. Audience and outcome are free text; time commitment, entry skills, intended depth, tooling constraints and exclusions are not structured planning inputs. | Validate and preserve those inputs. Generate explicit assumptions and setup requirements, with a reviewable scope and a measurable final deliverable. |
| A06 | Competency and alignment map. Prerequisite lesson indices and milestones exist; there is no explicit map connecting every outcome to instruction, practice and assessment. | Stable concept/outcome IDs connect taught skills to activities and evidence. Detect missing instruction, unsupported assessment demands, cycles and unassessed outcomes. |
| A07 | Whole-course planning and orchestration. Production tasks require an existing selected source lesson and operate on that lesson with one or two provider attempts. | Begin from a course brief, produce a proposed syllabus and dependency plan before drafting. Run bounded stages with checkpoints, per-stage review, cancellation, restart recovery, cost limits and idempotent writes. Resume unfinished stages without regenerating accepted work. |
| A08 | Full lesson authoring. Atlas currently changes objective, practice and Learn package; its application path does not generate or replace lesson teaching content. | Draft and revise substantive explanations, reasoning, examples, demonstrations and summaries as separate reviewable artifacts. Apply accepted changes with citations and a before/after view. Preserve instructor-owned content. |
| A09 | Course-wide consistency and change impact. Current checks mostly inspect required fields and individual assignments. | Track terminology, assumptions, skills introduced/used, notation, duplicate explanations and difficulty transitions. Changing a concept or runtime identifies dependent lessons, assessments and assets needing revalidation. |
| A10 | An explicit instructional progression. Prompts request good teaching, but structured lesson data does not represent demonstration, supported practice, independent practice and transfer separately. | Author each stage with progressively reduced support; check that a skill is taught before independent use. Permit different lesson designs where appropriate instead of imposing one rigid template. |
| A11 | Worked reasoning and misconception design. Practice input/output and hints exist; a worked-example requirement is not a complete explanation of the reasoning. | Provide annotated reasoning, a plausible wrong approach, a counterexample and a targeted diagnostic activity. Check example arithmetic, intermediate states, expected results and task/solution separation. |
| A12 | Integrated rich and accessible teaching assets. Lesson source is one text field plus attachment records, without an Academy lesson-block contract for diagrams, equations, alternative descriptions or caption tracks. | Support text, code, figures, tables, equations and media with text alternatives and captions/transcripts. Preserve associations through import/release/Learn. Automate structure, labeling, keyboard and media-reference checks; do not claim automated checks establish complete accessibility. |
| A13 | Selective editorial revision and history. Whole draft saves and agent assignment comparisons exist; they are not complete section-level editorial version control. | Review and accept individual section edits, restore earlier content, resolve concurrent edits and retain accepted custom material during regeneration. Include explicit instructor feedback and glossary/style guidance in subsequent drafts. |

Evidence: [course schema](../src/expansion-contract.ts), [project schema](../src/academy-design-contract.ts), [artifact schema and instructions](../src/agent-work-contract.ts), [task context and apply](../src/server/agent-work.ts), [teaching audit](../src/server/academy-studio.ts).

## Projects and technical verification

| ID | Gap and current boundary | Completion check without learner trials |
| --- | --- | --- |
| A14 | A complete evolving project design. Milestones and a shared project folder exist, but there is no typed architecture or explicit patch/dependency plan for the project across lessons. | Define the real user need, interfaces, data, constraints, milestone states and final acceptance. Support separate project scopes where a course needs multiple projects. Verify that each milestone is reachable from its stated starting state without overwriting learner work. |
| A15 | Validation of arbitrary generated teaching code. The compiler verifies one built-in Python API template, not arbitrary Forge output. | Run generated code in an isolated environment with bounded resources, controlled network access and captured results. Validate each supported language/runtime explicitly; mark others unverified. Never run untrusted generated code with the desktop user's unrestricted privileges. |
| A16 | Validation of generated checks. A syntactically valid test file can still be wrong, weak or accept the incomplete starter. | Execute tests against a correct implementation, the intended starter and plausible wrong implementations. Verify boundary cases, determinism, useful failure messages and avoidance of implementation-specific assertions. |
| A17 | Reproducible project environments. Free-text run commands and starter files do not provide a course-wide environment manifest. | Record runtime and dependency versions, fixtures, setup commands and supported platforms. Rebuild from a clean environment and validate every documented command and expected output. |
| A18 | Instructor-only solutions and marking guidance. Current learner packages hold criteria and hints, without a separate private assessment artifact. | Store reference solutions, reasoning, rubrics and common-error feedback separately from learner payloads. Test every API, export, asset and tutor path for accidental solution disclosure. Clearly separate worked instructional examples from protected assessment answers. |

Evidence: [Forge contract](../src/agent-work-contract.ts), [fixed compiler](../src/server/academy-compiler.ts), [starter delivery](../src/server/learn-delivery.ts), [teaching example tests](../tests/academy-example.test.ts). The example already exercises correct and incorrect implementations; extend that standard to generated projects rather than treating it as missing everywhere.

## Assessment and independent learning

| ID | Gap and current boundary | Completion check without learner trials |
| --- | --- | --- |
| A19 | Academy assessment authoring. The course package lacks typed placement diagnostics, concept questions, question banks and answer-specific feedback. | Author assessment items mapped to outcomes, with rationales, plausible distractors, partial-credit rules where applicable, independent variants and clear grading limits. Validate unique answers and ambiguous wording with fixed cases. |
| A20 | Cumulative retrieval and fading support. Hints, reflection and a transfer prompt exist, without an authored course-wide review schedule. | Revisit earlier concepts after delays, mix applicable skills and gradually reduce assistance. Test scheduling and coverage with a simulated clock and synthetic progress. Do not infer an optimal schedule for real learners from those tests. |
| A21 | Evidence-based course assessment. Completing the Academy self-review checks boxes and reflection length; it does not grade the submitted artifact. | Bind executable results and rubric evidence to an exact submission/version. Distinguish attempted, self-reviewed, automatically checked and instructor-reviewed states. Add revision feedback and assess independent transfer separately from guided completion. Reuse generic Learn evidence where suitable. |
| A22 | Deliberate differentiation and remediation. A learner-facing debug tutor exists, but Academy does not author explicit prerequisite repairs or alternate course paths. | Define diagnostic outcomes and bounded remedial/extension branches. Test prerequisite failures, skipped lessons and repeated misconceptions with synthetic histories. Avoid promoting a learner solely because they checked a self-review box. |

Evidence: [Learn package](../src/learn-package-contract.ts), [assignment review](../src/server/learn-delivery.ts), [generic project path](../src/server/learning-path.ts), [teacher guidance](../src/teacher-guidance.ts).

## Automated quality assurance

| ID | Gap and current boundary | Completion check without learner trials |
| --- | --- | --- |
| A23 | Course-production model evaluations. The inspected Academy tests primarily verify contracts, fixtures and workflow; they are not a standing benchmark of full-course generation quality across providers. | Establish representative original or permissioned briefs, expected concepts, known misconceptions and adversarial cases. Measure factual errors, unsupported claims, prerequisite leakage, copying, repetition, grading reliability, cost and latency across repeated generations. Preserve provider/model/prompt versions. |
| A24 | Independent technical and editorial critique. Self-check instructions and structural validators do not independently verify explanations or course coherence. | Run separate checks over the produced artifact and supporting evidence, including contradiction, arithmetic/code correctness, misleading simplification and editorial repetition. Keep deterministic checks distinct from probabilistic model judgments; surface disagreement rather than hiding it in a single quality score. |
| A25 | Uniform review status across publishing paths. The guided receipt can be bypassed through the older authenticated release path, as reproduced above. | Define draft, preview, reviewed and published states and enforce their invariants at local and hosted boundaries. Require current validation receipts for the advertised status. Test all supported entry points, stale receipts and repeated requests. |
| A26 | Reliable export/import at supported limits. The near-limit round-trip failure is reproduced above. | Separate raw transport limits from content limits; test actual pretty-printed exports, escape-heavy text, Unicode, references and large starter files. A valid supported export must import without silent loss. |

## Storage, delivery and operation

| ID | Gap and current boundary | Completion check without learner trials |
| --- | --- | --- |
| A27 | Full-course storage and context budgets. The course has a 300,000-character release limit while lessons, references and starter files share that budget. Raising lesson count alone does not make a rich long course fit. | Store versioned content/resources separately from the course manifest. Retrieve relevant sections and summaries with explicit completeness. Test representative full courses against local, hosted, import, gateway and provider limits without silent truncation. |
| A28 | Portable and hosted attachments. Local attachments cannot be published; course JSON carries references without the files. | Produce a self-contained package with file hashes and restore verification. Add scoped hosted media storage, authorized delivery, range support, resource lifecycle and failure recovery. Verify from a fresh device/account, not the author's original resource folder. |
| A29 | Learning context from attached resources. Tasks receive resource names and explicitly report their contents unavailable; attaching a PDF/video is not evidence ingestion. | Extract permitted PDF text or associate transcripts and select passages with page/time locations. Preserve extraction failures and uncertainty; do not pretend media metadata is visual or spoken understanding. |
| A30 | Updates, backup and learner migration. Immutable releases and preservation of learner files exist; they do not provide a complete course-upgrade or portable backup process. | Back up draft/history/media and restore independently. Preview release differences and changed assessments. Keep learners pinned by default; provide explicit, conflict-aware migration that preserves their work and evidence. |
| A31 | Production failure and scale coverage. Existing tests cover useful paths, but a complete generator adds larger jobs, partial output and more failure boundaries. | Test interruption, provider timeout, exhausted budget, concurrent edits, partial uploads, full disk, unavailable runtime, corrupted source, duplicate application and clean uninstall/reinstall. Retain stage-level receipts, actionable errors and bounded retry behavior. |
| A32 | A complete automated course acceptance run. Existing isolated checks do not compose a general full-course validation pipeline. | From a clean setup, plan and author a substantial original course, validate its examples and project states, package/re-import it, publish/enroll with synthetic accounts, and open every lesson in Learn. Exercise desktop and hosted boundaries, document remaining unsupported capabilities, and gate release on the resulting evidence. |

Evidence: [limits](../src/course-limits.ts), [resource library](../src/server/academy-resources.ts), [agent context](../src/server/agent-work.ts), [release and launch](../src/server/expansion.ts), [hosted course service](../services/ai/academy.ts). Existing provider retry bounds, concurrency checks and immutable releases should be retained when extending these workflows.

## Recommended implementation order

1. Resolve A25–A27 policy and capacity decisions and define A05–A06 course contracts. Otherwise new authoring stages will target an underspecified or undersized package.
2. Build A07–A13: planning, substantive lesson writing, coherent instruction and selective editing. These are the largest gaps between an assignment assistant and a complete course assistant.
3. Build A14–A19 and A21: an evolving practical project, safe execution, strong tests, reproducible setup and meaningful assessment evidence.
4. Expand A01–A04 and A29 alongside authoring, starting with an explicitly permissioned subject collection. Add A20 and A22 for cumulative review and repair paths.
5. Establish A23–A24 evaluations early and expand them at every stage. Complete A28 and A30–A32 before claiming a full publishing-and-learning workflow is release-ready.

A useful first acceptance target is one substantial original Python course with multiple modules, a cumulative project and a final independent task. Its examples, commands, grading checks, objective alignment, source provenance and clean-install delivery must all pass documented checks. The course's length and schedule are product choices, not evidence that it is rigorous.

## Educational design basis

[Carnegie Mellon's Eberly Center](https://www.cmu.edu/teaching/assessment/basics/alignment.html) describes alignment between intended outcomes, instructional activities and assessments. This supports the explicit alignment map in A06 and assessment design in A19; a checklist of lesson fields is not the same mapping.

The [IES practice guide on organizing instruction and study](https://ies.ed.gov/ncee/wwc/PracticeGuide/1) recommends spaced learning, alternating worked examples with problem solving, connecting concrete and abstract representations, quizzing and explanatory questions. Its recommendations carry differing evidence ratings and are not a guarantee for this particular product. They inform A10–A11 and A20.

[W3C's page structure guidance](https://www.w3.org/WAI/tutorials/page-structure/) explains meaningful headings, regions and relationships for accessible navigation. It informs the structural checks in A12; full accessibility still includes review beyond automated checks.

Actual learner persistence, perceived workload, engagement, learning gain and transfer in the wild remain outside this engineering audit. Source permissions and production credentials can also require external action. Those limits do not prevent implementing and verifying the contracts, tools and automated checks above.

## Reproduce the engineering probes

Run `npx tsx scripts/audit-academy-gaps.ts` from the repository root. The probe uses temporary local data, does not call an AI provider or hosted service, and prints the export/import boundary and low-level release observations. Its output describes gaps at the audited revision; it is not a passing product acceptance test. Once the issues are fixed, replace these observations with regression tests for the intended behavior.
