# Academy instructor workbench

Academy strengthens instructor-owned courses and delivers their practical work into Learn. The focused workflow is import → edit one lesson → connect a project → inspect findings → approve an exact revision → preview as a learner.

## Implemented design foundation

- Courses support up to 200 lessons and 40,000 characters of teaching material per lesson, within the existing 300,000-character release budget. Imports reject excess content instead of silently truncating it.
- Import an exported OutClass JSON file, or a Markdown outline using `# Course title`, `Audience:`, `Outcome:`, `## Lesson title`, `Objective:` and `Practice:`. Other text under a lesson is preserved as source material, including fenced code. Permission confirmation is reset on every import. Previewing an import never modifies a saved course.
- An optional evolving project defines its user need, final deliverable and lesson-linked increments with observable checks. Moving/removing lessons remaps prerequisite and milestone references. Forward dependencies become actionable release blockers.
- The deterministic review reports required-content blockers and separate teaching-quality findings: unobservable objectives, missing assignments, repetitive criteria, missing hints, reflection and transfer. It measures coverage, not mastery or pedagogical excellence. Instructors can resolve or explicitly acknowledge review findings.
- The guided release endpoint requires a review receipt matching the exact course revision and audit hash. A subsequent edit invalidates the receipt. Existing low-level expansion APIs retain compatibility; they do not imply completion of this guided review.
- Project courses open in one evolving project folder, with isolated instructor preview identities. Immutable milestone context reaches the Learn assignment and OffCourse. Starter files are created only if absent. Preview self-review is never labelled independent learner evidence.
- Academy tasks receive the selected project increment and bounded literal excerpts of long lessons. Stored source text remains intact, and partial context is labelled explicitly.

## Quality bar

Validate with complete instructor journeys: round-trip imports, referenced lesson moves, specific quality findings, stale review rejection, exact release preview, learner-authored attempts and preserved files. Deterministic checks and model smoke tests do not establish expert teaching quality. Real instructor and learner trials remain necessary.
