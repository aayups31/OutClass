# OutClass expansion implementation direction

October 14, 2026. Source: expansion-master-spec.md. This is a multi-release
programme; delivery status is recorded explicitly rather than equating pages with products.

## October 23, 2026 · Connected agent execution

The [0.8.0 preview](releases/0.8.0.md) adds bounded task workspaces that produce and apply concrete lesson packages, source-grounded scripts/timelines, channel campaigns and evidence briefs. Reviewed outputs become shared context only after a receiver accepts the handoff. Owned timed-caption imports now support keyword retrieval and cue-grounded clip proposals. Windows social sessions persist through account encryption; platform developer setup and a public OAuth broker remain separate gates. The earlier milestone descriptions below are historical snapshots. See [execution and validation boundaries](agent-work.md).

## Verified reusable foundation

- React/TypeScript desktop, CodeMirror, Node loopback companion, SQLite KV transactions.
- Course/session identities, granted coding folders, explicit execution, checkpoints,
  imported course sources, practice, evidence and two existing learner agents.
- Local API middleware rejects remote origins, scopes extension/editor tokens, requires
  bearer auth. New creator routes must sit after that middleware.
- Public Vercel static site + optional account/AI gateway; Supabase is currently used
  for identity, allowances and AI subscription billing, not creator organizations.
- No Academy commerce, creator memberships, media object storage, publishing OAuth,
  social/ads adapters, Academy launch grants or cloud workflow runner currently exist.
- Existing AI structured output supports teacher/architect/checkpoint contracts.
  New flagship agents need their own contracts; reusing the learner architect name
  as an included-AI curriculum endpoint would return the wrong shape.

## Product boundaries

Learn stays intact. Academy owns course drafts, immutable releases and enrollments.
Creator Studio owns brand/media/EDL/asset approval. GTM owns campaigns, links,
manual handoff and eventually confirmed distribution/attribution. Separate pages:
/learn, /academy, /creator-studio, /gtm.
Initial workspace paths: ?view=academy, ?view=creator, ?view=gtm.
These are additive local authoring tools, not a public marketplace.

## First working slices

1. Persist local Academy drafts, measurable lesson objectives, practice briefs,
   validation reports, revision checks and immutable locally released snapshots.
   Local self-enrollment -> version-pinned Learn course -> actual existing session.
   Use an in-process authenticated adapter; no public desktop launch/deep link claims.
2. Creator: editable source-grounded writing/storyboard and brand draft, exported
   manifests, review tied to exact revision. Actual source-video import/render comes
   next with isolated bounded FFmpeg workers. No text prompt labelled rendered video.
3. GTM: linked course/approved creative version, draft campaign, validated UTM URL,
   manual export, planned budget/currency and measurement checklist.
   No invented traffic/revenue/published state, no spend or external writes.
4. Academy Architect: bounded editable proposals with explicit model/cost consent;
   Python project compiler with real tests and starter/reference separation next.

## Shared contracts and persistence

Version 1 local expansion entities use their own KV prefix and Zod boundary schemas.
Local drafts never touch saved learner course data until explicit enrollment/launch.
Expected revision prevents stale tabs from overwriting drafts. Release and creative
approval freeze exact revisions; edits require fresh review. Limits on entities/text.
Local identity is the authenticated companion owner; no claims of multi-tenant isolation.
Cloud migration will introduce organizations/memberships, normalized Postgres tables
with RLS, upload objects, transactional outbox and durable jobs after identity design.
Existing AI/Stripe subscription tables remain separate from course commerce.

## Learn adapter

Course IDs include Academy release identity. Actual sessions use Application.start;
safe paths and workspace creation use existing Application checks. Lesson body/brief
is copied to the session note on explicit launch. No code execution or secret upload
occurs. Active sessions block a different launch. Telemetry sharing is absent by default.
Future hosted adapter: entitlement check, expiring single-use scoped grant, local
confirmation, immutable template hash, consented events, replay-safe exchange.
No permanent credentials in URLs and no unauthenticated localhost write route.

## Staged release gates

- Foundation: local drafts survive restart; invalid/unreviewed/stale releases blocked;
  local enrollments idempotent; actual Learn launch; all four public pages.
- Compiler: one Python stack, bounded sandbox execution, reference/tests verified,
  versioned acceptance/rubric/hint ladder; no published “verified” from schema checks.
- Studio: source rights, probes, timestamp index, editable EDL, actual bounded render,
  decoding/duration/caption QA, immutable exports, cancellation.
- Organic GTM: manual fallback first; one verified official provider, OAuth/scopes,
  precise approval, durable retry, external confirmation, consented first-party events.
- Commerce: separate Stripe course orders, idempotent webhook entitlements, refunds,
  actual fees/net ledger, marketplace payout decisions. Existing Plus is not course checkout.
- Ads: authorized read-only ingestion before approved writes. Unknown metrics stay unknown.
- Cross-product intelligence: evidence graph, consent, revisions and evaluated models.

## Cost discipline

Small commits represent finished slices, not token churn. Reuse architecture and
dependencies, no proactive subagents, no full-suite reruns for copy changes.
One targeted build/type check and relevant tests per behavioral milestone; repeat
only after changes/failures. No paid inference/render/provider calls by default.
Deterministic validation and outline scaffolds cost no API credits. A future agent run
must declare source/version, max calls/tokens and budget before execution.
A $7–15 development cost per commit is a target, not a guaranteed measurement:
Codex billing is account/model/session dependent and Git commits have no intrinsic cost.
Commercial provider costs need measured usage; no fictional per-course estimates.

## Remaining external setup

Public creator authentication/organizations; verified email sender; media bucket;
isolated workers/queue; official social/ads application access; course commerce
pricing/refund/payout policies. Existing account preview and test Stripe are retained.

## Delivered foundation — October 14, 2026

Public pages: /learn, /academy, /creator-studio, /gtm, plus homepage product links.
Source workspace: separate Academy, Creator Studio and GTM sidebar views and
reloadable ?view= paths. New UI is lazy loaded (~16 KB minified, ~5 KB gzip).

Working flow: create/edit course -> structure validation -> explicit local release
-> idempotent local enrollment -> actual Learn session with the lesson/practice in
its notes -> source-grounded creative brief -> exact copy approval -> campaign
draft with a pinned creative snapshot and hash -> exported manual handoff.
Local authoring persists in expansion:v1 in the existing SQLite KV table. No cloud
schema migration, public marketplace, external publishing or model invocation.
No private learner code is uploaded.

Validation: TypeScript check, Vite workspace build and site build passed. Six domain
tests passed, covering rights/stale revisions, immutable releases, restart durability,
real Learn launch and active-session conflicts, approval invalidation, campaign
snapshot preservation and invalid payloads. One full browser test traverses the
course-to-Learn-to-creative-to-campaign/export flow against an isolated real companion.
One responsive site test verifies all four pages at desktop/mobile sizes.
No new desktop installer published; use the source development build.

Next milestone: bounded Academy Architect contract and Python project compiler
with executed starter/reference/test validation; then source-media/EDL/FFmpeg
production. Organization auth and hosted launch grants precede public catalog/
enrollment. The entire master specification is not delivered by this foundation.

## Executable Academy and real Creator production milestone
The source build now has separate bounded Academy Architect, Creative Director and
Growth Strategist proposal contracts using the existing personal/included/local AI
provider. Saved creator drafts and bounded lesson excerpts are sent only after a
user confirms the run. Proposals persist with source IDs, revision, limits and status;
invalid source IDs are rejected. This pass tested the models with fixtures and did
not spend provider credits.

Academy can compile the vetted Python Activity API sequence. Course CI executes
18 reference checks, confirms the intentionally incomplete starter, and smoke-tests
the actual localhost HTTP boundary. The verified template is pinned to a released
course. Learn receives starter code, visible tests, a local server, sample data and
milestone instructions without overwriting an existing file. This is one supported
template, not verification of arbitrary instructor code or learner mastery.

Creator Studio imports owned MP4/MOV/WebM source files (80 MB/file, 320 MB library),
probes actual streams, edits clip ranges/captions, and runs a single bounded FFmpeg
worker. Landscape/portrait output, captions, editable timeline manifests, playback,
download and exact export approval work. Source files stay local; no cloud render
charges. Jobs survive as receipts; an interrupted job is marked failed and requires
explicit resubmission, not a hidden restart. Python and FFmpeg/FFprobe are required.
Real fixture rendering and media QA passed.
## Delivered workflow extension

The source preview now includes a private Supabase Academy schema and authenticated free-course catalog. Creators explicitly publish immutable versions; enrollment is idempotent; five-minute, account-bound, hashed, one-use grants import assignments into the existing Learn workspace. Lesson text becomes local RAG evidence. No learner code or progress is uploaded. The real database test exercises ownership and replay rejection inside a rollback-only transaction. Public email onboarding still needs a verified sender domain; the configured Resend test sender is owner-only.

Creator Studio now saves revision-controlled editable timelines, imports owned footage, renders actual landscape/portrait MP4 with captions using bounded local FFmpeg, verifies dimensions/duration/hash, and requires review of the exact export. Deterministic SVG/PNG designs include downloadable layer manifests. This does not yet provide automatic transcription, semantic footage search, generative media, a cloud render farm or cloud media hosting.

GTM adds YouTube, LinkedIn, X and Instagram OAuth/API adapters, durable exact-content reviews, duplicate-write prevention, accepted/confirmed/uncertain states, and dated manual reports with null-preserving financial calculations. Credentials, platform approval and real account validation remain necessary before claiming a working public channel integration. Tokens are process-local and require reconnection; a public OAuth broker and encrypted persistent token vault remain release prerequisites. No external posts, ads, paid model calls or campaign spending occurred during implementation. See `docs/social-publishing.md`.

Course payments, instructor payouts, settlement reconciliation, unattended scheduling, advertising ingestion, attribution and the remaining advanced master-spec features are not shipped. Existing AI subscription billing is unchanged. The published installer is still v0.7.1; these additions run from source until a new tested installer is released.
