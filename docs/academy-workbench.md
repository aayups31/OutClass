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
- The desktop workbench offers course outline import, one lesson at a time, a project editor, and a separate release review. Unsaved changes can be recovered from the local app after reloading. A stale recovery opens as a separate draft.
- The Architect can design a new assignment, strengthen an existing one, or connect it to a project increment. Instructors see the source citations and a before-and-after comparison before applying to the saved revision. The practice brief includes a concrete input and expected result for the learner to try.
- Starting a later lesson from Learn seeds that lesson’s assignment and project roadmap in the same project folder without replacing existing files. Full teaching material stays in the course library. The session note starts with a short objective and practice brief.
- Group adjacent lessons by chapter. Markdown outlines can use `## Chapter: Chapter name` followed by `### Lesson title` headings. Existing outlines with `## Lesson title` still import.
- Lesson resources accept MP4, WebM, PDF, ZIP, and UTF-8 code files. Learn can play video and download attachments. Instructors can copy individual code files into the assignment starter. Uploads stay in the device’s resource library. Course JSON carries file references, and hosted publishing is blocked for releases with local attachments.
- Project Forge drafts exercises or capstones with a README, ordered build milestones, verification steps, and starter code with TODOs. Instructors review the files before applying them. Learn copies approved starter files into the lesson assignment folder and preserves any existing files.

## Quality bar

Validate with complete instructor journeys: round-trip imports, referenced lesson moves, specific quality findings, stale review rejection, exact release preview, learner-authored attempts and preserved files. Deterministic checks and model smoke tests do not establish expert teaching quality. Real instructor and learner trials remain necessary.
