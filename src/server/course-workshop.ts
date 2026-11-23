import { createHash, randomUUID } from "node:crypto";
import { Router } from "express";
import { technicalInputHash } from "../course-integrity.js";
import { z } from "zod";
import {
  courseBrief,
  coursePlan,
  courseLessonAnswer,
  courseCritique,
  planningInstructions,
  lessonWritingInstructions as baseLessonWritingInstructions,
  courseWritingConstraints,
  courseEditorialConstraints,
  courseCritiqueInstructions,
  lessonGenerationSchema,
  critiqueGenerationSchema,
  stableId as stableIdForLock,
  type CourseBrief,
  type CoursePlan,
  type CourseLessonAnswer,
} from "../course-workshop-contract.js";
import {
  validatePlan,
  validateWrittenLesson,
  renderTeaching,
} from "../course-workshop-quality.js";
import type { Application } from "./application.js";
import { Expansion } from "./expansion.js";
import { CourseResearch } from "./course-research.js";
import { assertClean, UserError } from "./safety.js";
import { COURSE_CHAR_LIMIT } from "../course-limits.js";
import { CourseSandbox, type SandboxReport } from "./course-sandbox.js";
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const lessonWritingInstructions = `${baseLessonWritingInstructions}\n${courseWritingConstraints}\n${courseEditorialConstraints}`;
export type CourseJob = {
  id: string;
  revision: number;
  brief: CourseBrief;
  plan?: CoursePlan;
  proposedPlan?: CoursePlan;
  feedback?: string;
  sectionLocks?: Record<string, string[]>;
  planAccepted: boolean;
  lessons: Record<string, CourseLessonAnswer>;
  pendingLessons?: Record<string, CourseLessonAnswer>;
  pendingEvidence?: Record<string, ReturnType<CourseResearch["search"]>>;
  evidence: Record<string, ReturnType<CourseResearch["search"]>>;
  critique?: z.infer<typeof courseCritique>;
  critiqueDecisions?: Record<
    string,
    { reason: string; at: string; critiqueHash: string }
  >;
  critiques?: Record<string, z.infer<typeof courseCritique>>;
  phase: "draft" | "running" | "interrupted" | "ready" | "failed" | "applied";
  calls: number;
  maxCalls: number;
  events: { at: string; message: string }[];
  error?: string;
  history: { lessonId: string; revision: number; lesson: CourseLessonAnswer }[];
  verification?: Record<string, SandboxReport & { lessonHash: string }>;
  delivery?: { id: string; revision: number };
  createdAt: string;
};
export class CourseWorkshop {
  private active = new Set<string>();
  private stopped = false;
  readonly research: CourseResearch;
  constructor(private app: Application) {
    this.research = new CourseResearch(app);
    const legacy = this.app.store.get<CourseJob[]>("academy:course-jobs:v1");
    if (legacy)
      this.app.store.transaction(() => {
        for (const job of legacy)
          this.app.store.put(`academy:workshop:${job.id}`, job);
        this.app.store.put(
          "academy:workshop-index:v2",
          legacy.map(
            ({ id, revision, brief, phase, calls, maxCalls, delivery }) => ({
              id,
              revision,
              brief,
              phase,
              calls,
              maxCalls,
              delivery,
            }),
          ),
        );
        this.app.store.remove("academy:course-jobs:v1");
      });
    for (const job of this.list())
      if (job.phase === "running") {
        job.phase = "interrupted";
        this.save(
          job,
          "Interrupted on restart. Resume explicitly; accepted work was retained.",
        );
      }
  }
  list() {
    return this.index().map(({ id }) => this.get(id));
  }
  private index() {
    return (
      this.app.store.get<
        Pick<
          CourseJob,
          | "id"
          | "revision"
          | "brief"
          | "phase"
          | "calls"
          | "maxCalls"
          | "delivery"
        >[]
      >("academy:workshop-index:v2") || []
    );
  }
  get(id: string) {
    const job = this.app.store.get<CourseJob>(`academy:workshop:${id}`);
    if (!job) throw new UserError("Course workshop not found.", 404);
    return job;
  }
  private save(job: CourseJob, message: string) {
    job.revision++;
    job.events.push({ at: new Date().toISOString(), message });
    job.events = job.events.slice(-100);
    this.app.store.transaction(() => {
      this.app.store.put(`academy:workshop:${job.id}`, job);
      const { id, revision, brief, phase, calls, maxCalls, delivery } = job;
      this.app.store.put("academy:workshop-index:v2", [
        ...this.index().filter((row) => row.id !== id),
        { id, revision, brief, phase, calls, maxCalls, delivery },
      ]);
    });
  }
  private editable(id: string, revision: number) {
    const job = this.get(id);
    if (this.active.has(id))
      throw new UserError(
        "Wait for the current stage to finish, or cancel it.",
        409,
      );
    if (job.revision !== revision)
      throw new UserError("This workshop changed. Reload before editing.", 409);
    if (job.delivery)
      throw new UserError(
        "This workshop was delivered. Revise its course draft or start a separate workshop.",
        409,
      );
    return job;
  }
  create(raw: unknown) {
    const input = z
      .object({
        brief: courseBrief,
        maxCalls: z.number().int().min(5).max(100),
        approveProvider: z.literal(true),
      })
      .strict()
      .parse(raw);
    assertClean(JSON.stringify(input), "course brief");
    if (this.index().length >= 30)
      throw new UserError(
        "Export or complete existing workshops before creating more than 30.",
      );
    if (input.maxCalls < input.brief.lessonCount * 2 + 1)
      throw new UserError(
        "Budget one planning call and one writing and independent critique call per lesson.",
      );
    const job: CourseJob = {
      id: randomUUID(),
      revision: 0,
      brief: input.brief,
      planAccepted: false,
      lessons: {},
      evidence: {},
      phase: "draft",
      calls: 0,
      maxCalls: input.maxCalls,
      events: [],
      history: [],
      createdAt: new Date().toISOString(),
    };
    this.save(job, "Brief saved. No provider call has been made.");
    return job;
  }
  acceptPlan(id: string, revision: number, raw?: unknown) {
    const job = this.editable(id, revision);
    const plan = raw ? coursePlan.parse(raw) : job.plan || job.proposedPlan;
    if (!plan) throw new UserError("Generate or provide a course plan first.");
    const findings = validatePlan(job.brief, plan);
    if (findings.length)
      throw new UserError(findings.map((f) => f.detail).join(" "));
    if (
      job.plan &&
      digest(job.plan) !== digest(plan) &&
      Object.keys(job.lessons).length
    )
      throw new UserError(
        "Start a separate workshop to change an accepted plan after drafting lessons.",
      );
    job.plan = plan;
    delete job.proposedPlan;
    job.planAccepted = true;
    this.save(job, "Course plan accepted. Lesson writing is now available.");
    return job;
  }
  configure(id: string, revision: number, raw: unknown) {
    const input = z
      .object({
        feedback: z.string().max(4000),
        maxCalls: z.number().int().min(5).max(100),
        approveProvider: z.literal(true),
      })
      .strict()
      .parse(raw);
    const job = this.editable(id, revision);
    if (input.maxCalls < job.calls)
      throw new UserError(
        "The budget cannot be lower than calls already made.",
      );
    assertClean(input.feedback, "instructor feedback");
    job.feedback = input.feedback;
    job.maxCalls = input.maxCalls;
    this.save(
      job,
      "Instructor guidance and explicit provider-call budget updated.",
    );
    return job;
  }
  reviewCritique(id: string, revision: number, raw: unknown) {
    const input = z
        .object({
          findingHash: z.string().length(64),
          critiqueHash: z.string().length(64),
          reason: z.string().trim().min(40).max(2000),
        })
        .strict()
        .parse(raw),
      job = this.editable(id, revision);
    if (
      !job.critique ||
      digest(job.critique) !== input.critiqueHash ||
      !job.critique.findings.some(
        (finding) => digest(finding) === input.findingHash,
      )
    )
      throw new UserError(
        "This critique changed. Review the current finding.",
        409,
      );
    assertClean(input.reason, "editorial decision");
    job.critiqueDecisions = {
      ...job.critiqueDecisions,
      [input.findingHash]: {
        reason: input.reason,
        at: new Date().toISOString(),
        critiqueHash: input.critiqueHash,
      },
    };
    this.save(
      job,
      "Recorded an instructor disposition with evidence. The model finding remains visible.",
    );
    return job;
  }
  lockSections(id: string, revision: number, raw: unknown) {
    const input = z
        .object({
          lessonId: stableIdForLock,
          titles: z.array(z.string().max(160)).max(8),
        })
        .strict()
        .parse(raw),
      job = this.editable(id, revision),
      lesson = job.lessons[input.lessonId];
    if (
      !lesson ||
      input.titles.some(
        (title) => !lesson.sections.some((section) => section.title === title),
      )
    )
      throw new UserError("Choose existing lesson sections to protect.");
    job.sectionLocks = {
      ...job.sectionLocks,
      [input.lessonId]: [...new Set(input.titles)],
    };
    this.save(
      job,
      "Updated protected instructor wording for the next regeneration.",
    );
    return job;
  }
  backup(id: string) {
    return {
      format: "outclass-course-workshop",
      version: 1,
      job: this.get(id),
    };
  }
  restore(raw: unknown, maxCalls: number) {
    return this.app.store.transaction(() => this.restoreContent(raw, maxCalls));
  }
  private restoreContent(raw: unknown, maxCalls: number) {
    const source = z
      .object({
        id: z.string().max(100),
        title: z.string().max(300),
        text: z.string().max(6000),
        documentId: z.string().uuid(),
        hash: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict();
    const input = z
      .object({
        format: z.literal("outclass-course-workshop"),
        version: z.literal(1),
        job: z.object({
          brief: courseBrief,
          plan: coursePlan.optional(),
          proposedPlan: coursePlan.optional(),
          lessons: z.record(z.string(), courseLessonAnswer),
          evidence: z.record(z.string(), z.array(source).max(6)),
          feedback: z.string().max(4000).optional(),
          history: z
            .array(
              z.object({
                lessonId: z.string().max(60),
                revision: z.number().int(),
                lesson: courseLessonAnswer,
              }),
            )
            .max(40),
        }),
      })
      .parse(raw);
    const saved = this.create({
      brief: input.job.brief,
      maxCalls,
      approveProvider: true,
    });
    Object.assign(saved, {
      plan: input.job.plan,
      proposedPlan: input.job.proposedPlan,
      lessons: input.job.lessons,
      evidence: input.job.evidence,
      feedback: input.job.feedback,
      history: input.job.history,
    });
    if (saved.plan) {
      const ids = new Set(saved.plan.lessons.map((lesson) => lesson.id));
      if (Object.keys(saved.lessons).some((id) => !ids.has(id)))
        throw new UserError(
          "The workshop contains lessons outside its course plan.",
        );
      for (const [index, lesson] of saved.plan.lessons.entries())
        if (saved.lessons[lesson.id]) {
          const findings = validateWrittenLesson(
            saved.plan,
            index,
            saved.lessons[lesson.id],
            (saved.evidence[lesson.id] || []).map((s) => s.id),
            saved.evidence[lesson.id] || [],
          );
          if (findings.length) {
            saved.pendingLessons = {
              ...saved.pendingLessons,
              [lesson.id]: saved.lessons[lesson.id],
            };
            saved.pendingEvidence = {
              ...saved.pendingEvidence,
              [lesson.id]: saved.evidence[lesson.id] || [],
            };
            delete saved.lessons[lesson.id];
          }
        }
    } else if (Object.keys(saved.lessons).length)
      throw new UserError("A workshop with lessons requires a course plan.");
    this.save(
      saved,
      "Restored as a separate workshop. Reaccept the plan, recheck research permissions and rerun critique and technical checks.",
    );
    return saved;
  }
  remove(id: string, revision: number) {
    const job = this.get(id);
    if (this.active.has(id) || job.revision !== revision)
      throw new UserError(
        "Wait for this workshop stage or reload its revision.",
        409,
      );
    this.app.store.transaction(() => {
      this.app.store.put(
        "academy:workshop-index:v2",
        this.index().filter((job) => job.id !== id),
      );
      this.app.store.remove(`academy:workshop:${id}`);
    });
    return { removed: true };
  }
  editLesson(id: string, revision: number, raw: unknown) {
    const job = this.editable(id, revision),
      lesson = courseLessonAnswer.parse(raw);
    if (!job.plan) throw new UserError("Accept a course plan first.");
    const index = job.plan.lessons.findIndex(
      (item) => item.id === lesson.lessonId,
    );
    if (index < 0) throw new UserError("This lesson is not in the plan.");
    const findings = validateWrittenLesson(
      job.plan,
      index,
      lesson,
      (
        job.pendingEvidence?.[lesson.lessonId] ||
        job.evidence[lesson.lessonId] ||
        []
      ).map((source) => source.id),
      job.pendingEvidence?.[lesson.lessonId] ||
        job.evidence[lesson.lessonId] ||
        [],
    );
    if (findings.length)
      throw new UserError(findings.map((f) => f.detail).join(" "));
    if (job.lessons[lesson.lessonId])
      job.history.push({
        lessonId: lesson.lessonId,
        revision: job.revision,
        lesson: job.lessons[lesson.lessonId],
      });
    job.history = job.history.slice(-40);
    job.lessons[lesson.lessonId] = lesson;
    const protectedTitles = new Set(job.sectionLocks?.[lesson.lessonId] || []);
    const previous = job.history
      .filter((row) => row.lessonId === lesson.lessonId)
      .at(-1)?.lesson;
    if (previous)
      for (const section of lesson.sections)
        if (
          previous.sections.find((old) => old.title === section.title)?.body !==
          section.body
        )
          protectedTitles.add(section.title);
    job.sectionLocks = {
      ...job.sectionLocks,
      [lesson.lessonId]: [...protectedTitles].filter((title) =>
        lesson.sections.some((section) => section.title === title),
      ),
    };
    if (job.pendingEvidence?.[lesson.lessonId])
      job.evidence[lesson.lessonId] = job.pendingEvidence[lesson.lessonId];
    if (job.pendingLessons) delete job.pendingLessons[lesson.lessonId];
    if (job.verification) delete job.verification[lesson.lessonId];
    delete job.critique;
    job.critiques = {};
    this.save(job, "Lesson edited; independent critique must be run again.");
    return job;
  }
  cancel(id: string) {
    const job = this.get(id);
    if (this.active.has(id)) {
      job.phase = "interrupted";
      this.save(
        job,
        "Canceled. An in-flight provider request may still incur usage; its result will be discarded.",
      );
    }
    return job;
  }
  stop() {
    this.stopped = true;
    for (const id of this.active) this.cancel(id);
  }
  async next(id: string, revision: number, retryLessonId?: string) {
    const job = this.editable(id, revision);
    if (this.active.size >= 1)
      throw new UserError("Another course-generation stage is active.", 409);
    if (job.calls >= job.maxCalls)
      throw new UserError(
        "The approved provider-call budget is exhausted. Export the work before starting another workshop.",
      );
    if (!this.app.ai.ready())
      throw new UserError(
        "Configure an AI provider before generating course content.",
      );
    if (job.plan && !job.planAccepted)
      throw new UserError(
        "Review and accept the plan before generating lessons.",
      );
    let index =
      job.plan?.lessons.findIndex((lesson) => !job.lessons[lesson.id]) ?? -1;
    if (retryLessonId) {
      index =
        job.plan?.lessons.findIndex((lesson) => lesson.id === retryLessonId) ??
        -1;
      if (index < 0) throw new UserError("Choose a planned lesson to revise.");
    }
    this.active.add(id);
    job.phase = "running";
    job.calls++;
    const validationFeedback = job.error || "";
    delete job.error;
    this.save(
      job,
      "Provider stage started; call reserved within the approved budget.",
    );
    const guard = job.revision;
    try {
      if (!job.plan) {
        const sources = this.research.search(
          `${job.brief.title} ${job.brief.outcome}`,
        );
        const plan = await this.app.ai.structured({
          task: "course_plan",
          schema: coursePlan,
          name: "outclass_course_plan",
          instructions: `${planningInstructions}\nUse a controlled skill vocabulary. Every uses entry MUST exactly equal a string from brief.startingSkills or an EARLIER lesson's teaches array (case-insensitive). No synonyms, umbrella phrases such as 'all previous skills', or same-lesson teaches entries in uses. If a prerequisite is not available, introduce it first or remove the demand. Teach setup, tests and documentation explicitly if used later.`,
          context: JSON.stringify({
            brief: job.brief,
            sources,
            instructorFeedback: job.feedback || "",
          }),
        });
        job.proposedPlan = plan;
        const findings = validatePlan(job.brief, plan);
        if (findings.length)
          throw new UserError(findings.map((f) => f.detail).join(" "));
        job.plan = plan;
        delete job.proposedPlan;
      } else if (index >= 0) {
        const selected = job.plan.lessons[index],
          sources = this.research.search(
            `${selected.title} ${selected.teaches.join(" ")} ${job.brief.outcome}`,
          );
        const prior = job.plan.lessons.slice(0, index).map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          teaches: lesson.teaches,
          summary: (job.lessons[lesson.id]?.summary || "not written").slice(
            0,
            400,
          ),
          summaryComplete: (job.lessons[lesson.id]?.summary.length || 0) <= 400,
          privateImplementation:
            job.lessons[lesson.id] &&
            job.plan!.lessons.indexOf(lesson) === index - 1
              ? {
                  path: job.lessons[lesson.id].solutionPath,
                  content: job.lessons[lesson.id].instructorSolution.slice(
                    0,
                    16000,
                  ),
                  complete:
                    job.lessons[lesson.id].instructorSolution.length <= 16000,
                }
              : null,
        }));
        const context = JSON.stringify({
          brief: job.brief,
          plan: job.plan,
          selectedLesson: selected,
          index,
          previousLessons: prior,
          sources,
          previousDraft:
            job.pendingLessons?.[selected.id] ||
            (retryLessonId ? job.lessons[selected.id] : null),
          validationFeedback,
          instructorFeedback: job.feedback || "",
          previousTechnicalChecks: job.verification?.[selected.id] || null,
        });
        if (context.length > 85000)
          throw new UserError(
            "Narrow the research or course context before generating this lesson.",
          );
        const answer = await this.app.ai.structured({
          task: "course_lesson",
          schema: lessonGenerationSchema(context),
          name: "outclass_course_lesson",
          instructions: `${lessonWritingInstructions}\nRequired literal format: independentTask contains separate lines 'Example input: concrete input' and 'Expected result: concrete result', without Markdown around the labels. starterFiles MUST include README.md, an incomplete source file matching solutionPath EXACTLY, and discoverable behavioral tests (at least 3 files). Include the target source file even when revising an earlier project file. Every assessments[].id begins with '${selected.id}-'. Prerequisite indices are ZERO-based and strictly less than ${index}. Only these source IDs are legal: ${JSON.stringify(sources.map((s) => s.id))}; prior lessons, the brief and the plan are original continuity context, NOT research sources. If the list is empty, sourceIds and grounding MUST BOTH be empty arrays. The README must list the exact root-level test discovery command. Return the ENTIRE corrected lesson. Fix these rejected-draft issues: ${JSON.stringify(validationFeedback)}.`,
          context,
        });
        job.pendingLessons = { ...job.pendingLessons, [selected.id]: answer };
        for (const title of job.sectionLocks?.[selected.id] || []) {
          const original = job.lessons[selected.id]?.sections.find(
            (section) => section.title === title,
          );
          if (!original) continue;
          const position = answer.sections.findIndex(
            (section) => section.title === title,
          );
          if (position >= 0) answer.sections[position] = { ...original };
          else answer.sections.push({ ...original });
        }
        courseLessonAnswer.parse(answer);
        job.pendingEvidence = {
          ...job.pendingEvidence,
          [selected.id]: sources,
        };
        const findings = validateWrittenLesson(
          job.plan,
          index,
          answer,
          sources.map((source) => source.id),
          sources,
        );
        if (findings.length)
          throw new UserError(findings.map((f) => f.detail).join(" "));
        if (job.lessons[selected.id])
          job.history.push({
            lessonId: selected.id,
            revision: guard,
            lesson: job.lessons[selected.id],
          });
        job.lessons[selected.id] = answer;
        job.history = job.history.slice(-40);
        delete job.pendingLessons[selected.id];
        delete job.pendingEvidence[selected.id];
        if (job.verification) delete job.verification[selected.id];
        job.evidence[selected.id] = sources;
        delete job.critique;
        job.critiques = {};
      } else {
        const selected = job.plan.lessons.find(
          (lesson) => !job.critiques?.[lesson.id],
        );
        if (!selected)
          throw new UserError(
            "All critique stages are complete. Review or revise the draft.",
          );
        const overview = job.plan.lessons.map((lesson) => ({
          planned: lesson,
          summary: job.lessons[lesson.id].summary,
        }));
        const context = JSON.stringify({
          brief: job.brief,
          plan: job.plan,
          overview,
          selectedLesson: job.lessons[selected.id],
          sources: job.evidence[selected.id] || [],
        });
        if (context.length > 85000)
          throw new UserError(
            "Narrow this lesson's context before critique; no content was silently omitted.",
          );
        const critique = await this.app.ai.structured({
          task: "course_critique",
          schema: critiqueGenerationSchema(context),
          name: "outclass_course_critique",
          instructions: `${courseCritiqueInstructions}\nThe supplied instructorSolution, answerKeys and faultyImplementation are PRIVATE instructor artifacts; the tested delivery path strips them. Do not call their mere presence in this critique request solution leakage. Check for copied private answers INSIDE learner starterFiles, sections or prompts. CoursePlan.prerequisiteIds intentionally uses stable lesson-ID strings. Assignment.prerequisiteLessons intentionally uses ZERO-based numeric indices. These are different contracts and their conversion is tested; do not flag that distinction. Starter packages must be self-contained; prior lesson files are not automatically present in the assignment folder.`,
          context,
        });
        if (
          critique.findings.some(
            (f) =>
              !job.plan!.lessons.some((lesson) => lesson.id === f.lessonId),
          )
        )
          throw new UserError("The critic returned an unknown lesson ID.");
        job.critiques = { ...job.critiques, [selected.id]: critique };
        if (job.plan.lessons.every((lesson) => job.critiques?.[lesson.id]))
          job.critique = {
            findings: Object.values(job.critiques).flatMap(
              (row) => row.findings,
            ),
            limitations: [
              ...new Set(
                Object.values(job.critiques).flatMap((row) => row.limitations),
              ),
            ],
          };
      }
      if (
        this.stopped ||
        this.get(id).revision !== guard ||
        this.get(id).phase !== "running"
      )
        return this.get(id);
      job.phase = job.critique ? "ready" : "draft";
      this.save(
        job,
        job.critique
          ? "Independent critique saved. Inspect its findings before delivery."
          : "Stage saved. Accepted earlier work was preserved.",
      );
    } catch (error) {
      if (this.get(id).revision === guard) {
        job.phase = "failed";
        job.error = error instanceof Error ? error.message : "Stage failed";
        this.save(
          job,
          "Stage failed without discarding earlier work. Retry is explicit and counts toward the budget.",
        );
      }
    } finally {
      this.active.delete(id);
    }
    return this.get(id);
  }
  async verify(id: string, revision: number, lessonId: string) {
    const job = this.editable(id, revision),
      lesson = job.lessons[lessonId];
    if (!lesson) throw new UserError("Write this lesson first.");
    if (job.brief.language === "other")
      throw new UserError(
        "Automatic technical checks support Python and JavaScript; record a manual review for other runtimes.",
      );
    this.active.add(id);
    job.phase = "running";
    delete job.error;
    this.save(
      job,
      "Isolated technical verification started; no provider call is used.",
    );
    const guard = job.revision;
    try {
      const report = await new CourseSandbox().verify({
        language: job.brief.language,
        runtime: job.brief.runtime,
        files: lesson.assignment.starterFiles,
        solution: {
          path: lesson.solutionPath,
          content: lesson.instructorSolution,
        },
        mutation: {
          path: lesson.solutionPath,
          content: lesson.faultyImplementation,
        },
      });
      if (this.get(id).revision !== guard) return this.get(id);
      job.verification = {
        ...job.verification,
        [lessonId]: { ...report, lessonHash: digest(lesson) },
      };
      job.phase = job.critique ? "ready" : "draft";
      this.save(
        job,
        report.verified
          ? "Reference passes and starter/mutation fail the supplied tests. This verifies those checks, not every possible behavior."
          : "Technical checks did not establish the required reference/starter/mutation behavior.",
      );
    } catch (error) {
      if (this.get(id).revision === guard) {
        job.phase = "failed";
        job.error = (error as Error).message;
        this.save(
          job,
          "Verification unavailable or failed; generated code was not run on the host.",
        );
      }
    } finally {
      this.active.delete(id);
    }
    return this.get(id);
  }
  deliver(id: string, revision: number, approve: boolean) {
    if (approve && this.get(id).delivery) return this.get(id);
    const job = this.editable(id, revision);
    if (!approve || !job.plan || !job.planAccepted || !job.critique)
      throw new UserError(
        "Review the plan, all lessons and independent critique before delivery.",
      );
    if (
      job.critique.findings.some(
        (f) =>
          f.severity === "blocker" &&
          job.critiqueDecisions?.[digest(f)]?.critiqueHash !==
            digest(job.critique),
      )
    )
      throw new UserError(
        "Resolve the critic's blockers and run critique again.",
      );
    if (
      job.brief.language !== "other" &&
      job.plan.lessons.some(
        (lesson) =>
          !job.verification?.[lesson.id]?.verified ||
          job.verification[lesson.id].lessonHash !==
            digest(job.lessons[lesson.id]),
      )
    )
      throw new UserError(
        "Verify each current starter, reference implementation and deliberate mistake in isolation before delivering this coding course.",
      );
    const documentIds = new Map(
      this.research
        .list()
        .filter((row) => row.active)
        .map((row) => [row.id, row]),
    );
    const lessons = job.plan.lessons.map((planned, index) => {
      const written = job.lessons[planned.id];
      if (!written)
        throw new UserError(`Write ${planned.title} before delivery.`);
      for (const source of job.evidence[planned.id] || []) {
        const current = documentIds.get(source.documentId);
        if (
          !current ||
          current.hash !== source.hash ||
          (current.metadata.expiresOn &&
            current.metadata.expiresOn < new Date().toISOString().slice(0, 10))
        )
          throw new UserError(
            "Research changed or permission expired. Regenerate affected lessons before delivery.",
          );
      }
      return {
        title: planned.title,
        chapter: planned.module,
        objective: planned.outcomeIds
          .map(
            (id) =>
              job.plan!.outcomes.find((outcome) => outcome.id === id)!
                .description,
          )
          .join("; "),
        practice: written.independentTask,
        content: renderTeaching(written),
        learn: {
          ...written.assignment,
          prerequisiteLessons: planned.prerequisiteIds.map((id) =>
            job.plan!.lessons.findIndex((item) => item.id === id),
          ),
          transferChallenge: written.transferTask,
        },
        assessments: written.assessments,
        rubric: written.rubric,
        researchEvidence: [
          ...new Set(
            (job.evidence[planned.id] || [])
              .filter((source) => written.sourceIds.includes(source.id))
              .map((source) => source.documentId),
          ),
        ].map((documentId) => ({
          documentId,
          hash: documentIds.get(documentId)!.hash,
          expiresOn: documentIds.get(documentId)!.metadata.expiresOn,
        })),
        ...(job.brief.language !== "other"
          ? {
              codeCheck: {
                language: job.brief.language,
                runtime: job.brief.runtime,
                sourcePath: written.solutionPath,
              },
            }
          : {}),
        ...(job.verification?.[planned.id]?.lessonHash === digest(written)
          ? {
              technicalVerification: (({ hash, verified, image, at }) => ({
                hash,
                verified,
                image,
                at,
              }))(job.verification[planned.id]),
            }
          : {}),
        references: [
          ...new Set(
            (job.evidence[planned.id] || [])
              .filter((source) => written.sourceIds.includes(source.id))
              .map((source) => source.documentId),
          ),
        ].map((id) => documentIds.get(id)!.metadata.reference),
      };
    });
    for (const lesson of lessons)
      if (lesson.technicalVerification)
        Object.assign(lesson.technicalVerification, {
          inputHash: technicalInputHash(lesson),
        });
    const draft = {
      title: job.brief.title,
      audience: job.brief.audience,
      outcome: job.brief.outcome,
      rightsConfirmed: false,
      lessons,
      design: { brief: job.brief, plan: job.plan },
      learningProject: {
        title: job.brief.deliverable,
        problem: job.plan.project.problem,
        deliverable: job.brief.deliverable,
        milestones: job.plan.lessons.map((lesson, index) => ({
          lessonIndex: index,
          title: lesson.title,
          brief: lesson.milestone,
          acceptanceCriteria: job.lessons[
            lesson.id
          ].assignment.acceptanceCriteria.slice(0, 6),
        })),
      },
    };
    if (JSON.stringify(draft).length > COURSE_CHAR_LIMIT)
      throw new UserError(
        "Split this course into modules before delivery; the current draft exceeds the release content budget.",
      );
    this.app.store.transaction(() => {
      const saved = new Expansion(this.app).saveCourse({
        ...draft,
        expectedRevision: 0,
      });
      this.app.store.put(
        `academy:teacher:${saved.id}:${saved.revision}`,
        Object.values(job.lessons).flatMap((lesson) => lesson.answerKeys),
      );
      this.app.store.put(`academy:editorial:${saved.id}:${saved.revision}`, {
        critique: job.critique,
        decisions: job.critiqueDecisions || {},
      });
      this.app.store.put(
        `academy:solutions:${saved.id}:${saved.revision}`,
        Object.fromEntries(
          Object.values(job.lessons).map((lesson) => [
            lesson.lessonId,
            lesson.instructorSolution,
          ]),
        ),
      );
      job.delivery = { id: saved.id, revision: saved.revision };
      job.phase = "applied";
      this.save(
        job,
        "Delivered a new instructor draft. Rights confirmation, release review and publication remain explicit.",
      );
    });
    return job;
  }
  routes() {
    const router = Router();
    router.get("/runtime", (_req, res) =>
      res.json({
        backend:
          process.env.OUTCLASS_SANDBOX_BACKEND === "vercel"
            ? "Vercel Sandbox"
            : "local Docker",
      }),
    );
    router.get("/", (_req, res) =>
      res.json(
        this.index().map(
          ({ id, revision, brief, phase, calls, maxCalls, delivery }) => ({
            id,
            revision,
            brief,
            phase,
            calls,
            maxCalls,
            delivery,
          }),
        ),
      ),
    );
    router.post("/", (req, res) => res.json(this.create(req.body)));
    router.post("/restore", (req, res) => {
      const input = z
        .object({
          backup: z.unknown(),
          maxCalls: z.number().int().min(5).max(100),
          approveProvider: z.literal(true),
        })
        .strict()
        .parse(req.body);
      res.json(
        this.app.store.transaction(() =>
          this.restore(input.backup, input.maxCalls),
        ),
      );
    });
    router.get("/:id/backup", (req, res) =>
      res.json(this.backup(req.params.id)),
    );
    router.post("/:id/remove", (req, res) =>
      res.json(
        this.remove(
          req.params.id,
          z.object({ revision: z.number().int() }).strict().parse(req.body)
            .revision,
        ),
      ),
    );
    router.get("/:id", (req, res) =>
      res.json(this.get(z.string().uuid().parse(req.params.id))),
    );
    router.post("/:id/next", async (req, res) => {
      const input = z
        .object({
          revision: z.number().int(),
          retryLessonId: z.string().optional(),
        })
        .strict()
        .parse(req.body);
      res.json(
        await this.next(req.params.id, input.revision, input.retryLessonId),
      );
    });
    router.post("/:id/plan", (req, res) => {
      const input = z
        .object({ revision: z.number().int(), plan: coursePlan.optional() })
        .strict()
        .parse(req.body);
      res.json(this.acceptPlan(req.params.id, input.revision, input.plan));
    });
    router.post("/:id/configure", (req, res) => {
      const { revision, ...input } = z
        .object({
          revision: z.number().int(),
          feedback: z.string().max(4000),
          maxCalls: z.number().int(),
          approveProvider: z.literal(true),
        })
        .strict()
        .parse(req.body);
      res.json(this.configure(req.params.id, revision, input));
    });
    router.post("/:id/critique-review", (req, res) => {
      const { revision, ...input } = z
        .object({
          revision: z.number().int(),
          findingHash: z.string(),
          critiqueHash: z.string(),
          reason: z.string(),
        })
        .strict()
        .parse(req.body);
      res.json(this.reviewCritique(req.params.id, revision, input));
    });
    router.post("/:id/lesson", (req, res) => {
      const input = z
        .object({ revision: z.number().int(), lesson: courseLessonAnswer })
        .strict()
        .parse(req.body);
      res.json(this.editLesson(req.params.id, input.revision, input.lesson));
    });
    router.post("/:id/section-locks", (req, res) => {
      const { revision, ...input } = z
        .object({
          revision: z.number().int(),
          lessonId: stableIdForLock,
          titles: z.array(z.string().max(160)).max(8),
        })
        .strict()
        .parse(req.body);
      res.json(this.lockSections(req.params.id, revision, input));
    });
    router.post("/:id/cancel", (req, res) =>
      res.json(this.cancel(req.params.id)),
    );
    router.post("/:id/deliver", (req, res) => {
      const input = z
        .object({ revision: z.number().int(), approve: z.literal(true) })
        .strict()
        .parse(req.body);
      res.json(this.deliver(req.params.id, input.revision, input.approve));
    });
    router.post("/:id/verify", async (req, res) => {
      const input = z
        .object({ revision: z.number().int(), lessonId: z.string() })
        .strict()
        .parse(req.body);
      res.json(
        await this.verify(req.params.id, input.revision, input.lessonId),
      );
    });
    return router;
  }
}
