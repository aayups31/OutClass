# Academy readings and source evidence

Academy now separates source discovery from material an agent can actually use. The starter catalog contains 19 official course pages from MIT, Stanford and Carnegie Mellon, checked November 21, 2026. It covers introductory programming, software construction, algorithms, mathematical foundations, probability, systems, databases and machine learning. These are discovery links, not an ingested university corpus. Individual readings, videos and assessments may have different access and reuse conditions.

## Instructor workflow

Open a lesson's **Teaching material → Readings & source evidence**. Search the university catalog or add a specific source. Record the title, publisher, actual author, original URL, license or permission, and a note explaining permission for the intended use. Paste a focused excerpt, then explicitly approve sending it to the configured AI provider. Each lesson supports 12 references with up to 12,000 characters per excerpt, within the existing overall course release size limit.

Editing any source field clears its approval in the workbench. Importing an exported course also clears reference approvals, alongside the course's rights confirmation. Links without excerpts can remain for discovery. A draft excerpt without approval is excluded from agent context and blocks release until reviewed or removed. The approval is an instructor assertion, not an automated legal determination or a verified license grant.

## What Atlas and Forge receive

The production task ranks approved readings attached to its selected lesson and selects at most three. It retrieves bounded, literal passages of up to 1,800 characters per reading. Each carries its author, source URL, license, permission note and an explicit completeness flag. A source record says that the excerpt was supplied by the instructor and that the task did not fetch the URL. The task's reference coverage reports attached, approved and selected counts.

The lesson itself remains the primary source. When a reading is supplied, a generated assignment must cite at least one supplied `reading:` source ID as well as its selected lesson ID. The validator rejects missing or invented citations. Instructions call for original explanations, examples, exercises and test inputs, calibrated to the learner and curriculum, with conflicts or missing evidence disclosed. These checks establish provenance and structure; they cannot establish factual accuracy or pedagogical excellence by themselves.

The bounded quick-review proposal uses approved readings from its own lesson window. Its general draft excerpt strips reference records, so unapproved source text cannot bypass selection by appearing inside a serialized course draft.

## What reaches Learn

The immutable release preserves reference records. Learners see approved reading links, authors and use notes in their assignment. Academy seeds an attributed `SOURCES.md` beside the assignment files; it reserves that path when approved references are present. As with other assignment files, an existing learner file is preserved. Learners receive source acknowledgments rather than an assertion that the university authored, reviewed or endorsed their course.

## Access and reuse

The catalog does not grant reuse permission. [MIT OCW's current terms](https://ocw.mit.edu/pages/privacy-and-terms-of-use/) describe CC BY-NC-SA 4.0 and additional terms, including restrictions relevant to commercial use and AI. Public Stanford and CMU course pages do not establish a blanket license for every linked document. Record the applicable permission for each specific excerpt and its intended distribution.

No bulk scraping, automatic URL ingestion, model training, or university content bundle was added. Scaling this into a large automatic research corpus requires a reviewed, permissioned collection and an ingestion process that preserves attribution, versions and source boundaries. A large number of links alone is not that corpus.

## Verification

The focused regression run passed 43 tests across seven files, covering HTTPS URL validation, attribution requirements, discovery-only records, exclusion of unapproved text, bounded retrieval, selected-lesson isolation, mandatory real citations, import approval reset, release blocking, preserved reference records and acknowledgments delivered to Learn. All five reference-specific tests also passed after tightening URL validation. The source browser journey passed discovery, excerpt approval, approval reset on editing, release and learner delivery; the existing authoring and agent journeys also passed. Browser cases use isolated course/session data. Live-model synthesis quality still requires representative educator review.

```text
npm run build
npx vitest run tests/academy-references.test.ts tests/agent-work.test.ts tests/academy-studio.test.ts tests/learn-delivery.test.ts tests/product-agents.test.ts tests/academy-example.test.ts tests/expansion.test.ts
npx playwright test tests/e2e/expansion.spec.ts tests/e2e/agent-work.spec.ts
```
