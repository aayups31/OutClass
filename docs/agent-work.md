# Task-based product agents

Each saved product draft has a task workspace. A task snapshots the selected lesson, saved creator brief, accepted handoffs and applicable recorded campaign evidence. Private Learn code, private Git history and learner conversations are excluded.

| Specialist | Deliverable | What Apply does |
| --- | --- | --- |
| Academy Architect | Objective, practical task, acceptance criteria, progressive hints, reflection and transfer challenge | Saves a new course revision and Learn package, preserving existing starter files. Course release and instructor preview remain explicit. |
| Creative Director | Teaching script, scene captions and optional proposed ranges in selected owned footage | Saves a creative revision, invalidates its old approval, and saves an editable timeline when footage was selected. Rendering and playback review remain explicit. |
| Growth Strategist | One distinct source-cited post per requested channel | Creates source-linked promotion and local campaign drafts through GTM's channel validators. It does not publish, schedule or spend money. |
| Analytics | Interpretations, missing evidence and bounded experiments with measures and stopping rules | Saves an evidence brief separately from recorded provider observations and manual reports. It does not invent missing measurements. |

## Execution and review

- Starting a task authorizes at most one or two provider calls using the configured personal, local or included AI connection. The optional second call corrects a failed deliverable validation; it is not an unbounded agent loop.
- Progress, call attempts, source snapshots, validation findings and outputs persist in the local SQLite store. Closing the app marks active tasks interrupted. Restart does not automatically spend credits or retry writes.
- Exact source and result hashes bind the review. A changed source, unknown citation, invalid prerequisite, unsupported channel or out-of-range scene blocks application. Local draft mutations and their receipts use atomic nested transactions.
- Applying the same reviewed result again returns its saved receipt. GTM retains prepared artifact IDs to avoid duplicate channel preparation when a delivery is retried.
- Cancellation discards subsequent results. A provider request already in flight can still complete and incur its normal charge, but its returned output is not applied.
- Every result can be exported with its evidence and progress receipt. Source passages remain untrusted material, not instructions.

## Boundaries

These checks verify structure, supplied provenance, ranges and state consistency. They do not establish expert-level editorial judgment, pedagogical effectiveness or factual entailment of every generated sentence. Instructor review and learner trials remain necessary. Without selected footage the Creative Director creates a script with no invented timestamps; footage metadata alone is not a transcript or visual understanding.

The included-AI gateway must deploy the `work` task contract along with the desktop changes. Existing teacher, architect, checkpoint and proposal contracts remain backward compatible. Live social posting still requires eligible configured accounts and the existing exact-publication review.
