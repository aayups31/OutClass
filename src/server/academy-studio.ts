import { createHash, randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import {
  courseDraft,
  type AcademyDraft,
  type Revision,
} from "../expansion-contract.js";
import type {
  AcademyAudit,
  AcademyFinding,
} from "../academy-design-contract.js";
import {
  COURSE_CHAR_LIMIT,
  COURSE_LESSON_LIMIT,
  COURSE_SOURCE_LIMIT,
} from "../course-limits.js";
import { learnPackageIssues } from "../learn-package-contract.js";
import type { Application } from "./application.js";
import type { Expansion } from "./expansion.js";
import { assertClean, UserError } from "./safety.js";
const digest = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function courseContent(c: AcademyDraft): AcademyDraft {
  return {
    title: c.title,
    audience: c.audience,
    outcome: c.outcome,
    rightsConfirmed: c.rightsConfirmed,
    lessons: c.lessons,
    ...(c.learningProject ? { learningProject: c.learningProject } : {}),
  };
}
export function importAcademy(raw: unknown) {
  const input = z
    .object({
      name: z.string().min(1).max(180),
      text: z.string().max(COURSE_CHAR_LIMIT),
    })
    .strict()
    .parse(raw);
  assertClean(input.text, "course import");
  let result: AcademyDraft;
  if (/\.json$/i.test(input.name)) {
    try {
      const json = JSON.parse(input.text.replace(/^\uFEFF/, ""));
      result =
        json?.format === "outclass-academy"
          ? z
              .object({
                format: z.literal("outclass-academy"),
                version: z.literal(1),
                course: courseDraft,
              })
              .strict()
              .parse(json).course
          : courseDraft.parse(json);
    } catch {
      throw new UserError(
        "Import a valid OutClass course JSON file. No content was changed.",
      );
    }
  } else if (/\.(md|txt)$/i.test(input.name)) {
    result = {
      title: "",
      audience: "",
      outcome: "",
      rightsConfirmed: false,
      lessons: [],
    };
    let lesson: AcademyDraft["lessons"][number] | undefined;
    let fence = false;
    for (const line of input.text
      .replace(/^\uFEFF/, "")
      .replace(/\r\n?/g, "\n")
      .split("\n")) {
      if (/^\s*(```|~~~)/.test(line)) fence = !fence;
      if (!fence) {
        const title = /^#\s+(.+)$/.exec(line);
        if (title && !lesson) {
          result.title = title[1].trim();
          continue;
        }
        const heading = /^##\s+(?:Lesson\s*(?:\d+)?\s*[:.—-]\s*)?(.+)$/i.exec(
          line,
        );
        if (heading) {
          lesson = {
            title: heading[1].trim(),
            objective: "",
            practice: "",
            content: "",
          };
          result.lessons.push(lesson);
          continue;
        }
        const meta = /^(Audience|Outcome|Objective|Practice):\s*(.*)$/i.exec(
          line,
        );
        if (meta) {
          const key = meta[1].toLowerCase();
          if (!lesson && (key === "audience" || key === "outcome")) {
            result[key] = meta[2];
            continue;
          }
          if (lesson && (key === "objective" || key === "practice")) {
            lesson[key] = meta[2];
            continue;
          }
        }
      }
      if (lesson) lesson.content += (lesson.content ? "\n" : "") + line;
      else if (line.trim())
        throw new UserError(
          "Put teaching material under a ## Lesson heading; use Audience: and Outcome: above it. No introductory text was silently discarded.",
        );
    }
    result.lessons.forEach((l) => (l.content = l.content.trim()));
    if (!result.title || !result.lessons.length)
      throw new UserError(
        "Use # Course title and ## Lesson headings. Your original file has not been changed.",
      );
    const parsed = courseDraft.safeParse(result);
    if (!parsed.success)
      throw new UserError(
        `Keep imports within ${COURSE_LESSON_LIMIT} lessons, ${COURSE_SOURCE_LIMIT.toLocaleString()} characters per lesson and ${COURSE_CHAR_LIMIT.toLocaleString()} characters overall. Nothing was truncated.`,
      );
    result = parsed.data;
  } else
    throw new UserError(
      "Choose an OutClass JSON or a Markdown/text course outline.",
    );
  // Importing never carries rights approval or silently changes a saved draft.
  result.rightsConfirmed = false;
  return {
    course: result,
    hash: digest(result),
    warnings: [
      "Review the imported material and confirm your permission before release.",
    ],
    format: "outclass-academy" as const,
  };
}
export function auditAcademy(course: Revision<AcademyDraft>): AcademyAudit {
  const findings: AcademyFinding[] = [];
  const add = (
    id: string,
    level: AcademyFinding["level"],
    field: string,
    title: string,
    detail: string,
    lessonIndex?: number,
  ) =>
    findings.push({
      id,
      level,
      field,
      title,
      detail,
      ...(lessonIndex === undefined ? {} : { lessonIndex }),
    });
  for (const [field, title] of [
    ["audience", "Define your learner"],
    ["outcome", "Define the result"],
  ] as const)
    if (!course[field].trim())
      add(
        field,
        "blocker",
        field,
        title,
        "Describe the starting experience and an observable result from the learner’s own work.",
      );
  if (!course.rightsConfirmed)
    add(
      "rights",
      "blocker",
      "rightsConfirmed",
      "Confirm permission",
      "Confirm that you own or have permission to use this course material.",
    );
  if (!course.lessons.length)
    add(
      "lessons",
      "blocker",
      "lessons",
      "Add a lesson",
      "Start with an existing lesson and its teaching material.",
    );
  if (JSON.stringify(courseContent(course)).length > COURSE_CHAR_LIMIT)
    add(
      "size",
      "blocker",
      "content",
      "Split the course package",
      "Keep this release under 300,000 characters. Exported material is never silently truncated.",
    );
  learnPackageIssues(course.lessons).forEach((detail, i) =>
    add(
      `structure:${i}`,
      "blocker",
      "learn",
      "Repair the learning path",
      detail,
    ),
  );
  const titles = new Map<string, number>();
  let assignments = 0,
    reflections = 0,
    transfers = 0,
    minutes = 0;
  course.lessons.forEach((l, i) => {
    for (const field of ["title", "objective", "practice", "content"] as const)
      if (!l[field].trim())
        add(
          `${i}:${field}`,
          "blocker",
          field,
          `Add lesson ${field}`,
          "This field is needed for a usable lesson and its Learn experience.",
          i,
        );
    const title = l.title.trim().toLowerCase();
    if (title && titles.has(title))
      add(
        `${i}:duplicate-title`,
        "review",
        "title",
        "Distinguish this lesson",
        `It has the same title as lesson ${titles.get(title)! + 1}. Make navigation and source attribution clear.`,
        i,
      );
    titles.set(title, i);
    if (/\b(understand|know|learn about|be familiar)\b/i.test(l.objective))
      add(
        `${i}:observable`,
        "review",
        "objective",
        "Make the objective observable",
        "Describe what learners can build, explain, diagnose or demonstrate, with a result they can check.",
        i,
      );
    const p = l.learn;
    if (!p) {
      add(
        `${i}:assignment`,
        "review",
        "learn",
        "Add a Learn assignment",
        "The lesson has a practice description, but no acceptance criteria, progressive hints or review experience in Learn.",
        i,
      );
      return;
    }
    assignments++;
    minutes += p.minutes;
    if (p.prerequisiteLessons.some((n) => n >= i))
      add(
        `${i}:order`,
        "blocker",
        "learn",
        "Teach prerequisites earlier",
        "Move this lesson or update its prerequisite links so learners can follow the published order.",
        i,
      );
    if (
      p.acceptanceCriteria.some((c) =>
        /^(understand|know|learn|complete|finish)\b/i.test(c.trim()),
      )
    )
      add(
        `${i}:criteria`,
        "review",
        "learn",
        "Make success testable",
        "Replace completion or understanding claims with observable behavior, an example output or an evidence requirement.",
        i,
      );
    if (!p.hints.length)
      add(
        `${i}:hints`,
        "review",
        "learn",
        "Add a progressive hint",
        "Start with a reasoning question, then a diagnostic experiment. Keep the learner’s implementation theirs.",
        i,
      );
    if (p.reflection.trim()) reflections++;
    else
      add(
        `${i}:reflection`,
        "review",
        "learn",
        "Ask for reflection evidence",
        "Ask what the learner tested, observed and changed, rather than a confidence rating.",
        i,
      );
    if (p.transferChallenge.trim()) transfers++;
    else
      add(
        `${i}:transfer`,
        "review",
        "learn",
        "Change one requirement",
        "Ask learners to use the idea differently after their first successful attempt.",
        i,
      );
    if (
      new Set(p.acceptanceCriteria.map((c) => c.trim().toLowerCase())).size !==
      p.acceptanceCriteria.length
    )
      add(
        `${i}:duplicate-criteria`,
        "review",
        "learn",
        "Remove repeated criteria",
        "Each criterion should check a distinct part of the result.",
        i,
      );
  });
  const project = course.learningProject;
  if (project) {
    for (const field of ["title", "problem", "deliverable"] as const)
      if (!project[field].trim())
        add(
          `project:${field}`,
          "blocker",
          "project",
          `Complete the project ${field}`,
          "Give the project a clear user need and final deliverable.",
        );
    const used = new Set<number>();
    project.milestones.forEach((m, i) => {
      if (!course.lessons[m.lessonIndex] || used.has(m.lessonIndex))
        add(
          `milestone:${i}:link`,
          "blocker",
          "project",
          "Repair a milestone link",
          "Choose a distinct existing lesson for every milestone.",
        );
      used.add(m.lessonIndex);
      if (
        !m.title.trim() ||
        !m.brief.trim() ||
        !m.acceptanceCriteria.some((c) => c.trim())
      )
        add(
          `milestone:${i}:brief`,
          "blocker",
          "project",
          "Complete the milestone",
          "Name the increment, describe the learner’s work and add an observable check.",
          m.lessonIndex,
        );
      if (course.lessons[m.lessonIndex] && !course.lessons[m.lessonIndex].learn)
        add(
          `milestone:${i}:assignment`,
          "review",
          "learn",
          "Connect the milestone to Learn",
          "Add this lesson’s Learn package so the milestone has a guided review experience.",
          m.lessonIndex,
        );
    });
    if (!project.milestones.length)
      add(
        "project:milestones",
        "review",
        "project",
        "Add the first increment",
        "Connect a small, useful project increment to a lesson where learners have enough context.",
      );
  } else if (course.lessons.length > 1)
    add(
      "project",
      "suggestion",
      "project",
      "Consider one evolving project",
      "Let learners make something useful throughout the course. A project is optional; individual exercises can be appropriate.",
    );
  const content = courseContent(course),
    courseHash = digest(content);
  return {
    hash: digest({
      version: 1,
      courseHash,
      revision: course.revision,
      findings,
    }),
    courseHash,
    revision: course.revision,
    findings,
    coverage: {
      lessons: course.lessons.length,
      assignments,
      reflections,
      transfers,
      minutes,
      milestones: project?.milestones.length || 0,
    },
  };
}
export class AcademyStudio {
  constructor(
    private app: Application,
    private expansion: Expansion,
  ) {}
  course(id: string) {
    const c = this.expansion.state().courses.find((c) => c.id === id);
    if (!c) throw new UserError("Save a course draft first.", 404);
    return c;
  }
  audit(id: string) {
    const report = auditAcademy(this.course(id));
    const review = this.app.store.get<AcademyAudit["review"]>(
      `academy:review:${id}`,
    );
    return { ...report, ...(review?.hash === report.hash ? { review } : {}) };
  }
  review(id: string, raw: unknown) {
    const input = z
      .object({
        expectedRevision: z.number().int().positive(),
        hash: z.string().length(64),
        acknowledged: z.array(z.string().max(100)).max(2000),
        approve: z.literal(true),
      })
      .strict()
      .parse(raw);
    return this.app.store.transaction(() => {
      const report = this.audit(id);
      if (
        report.revision !== input.expectedRevision ||
        report.hash !== input.hash
      )
        throw new UserError(
          "This course or quality report changed. Review the current revision.",
          409,
        );
      if (report.findings.some((f) => f.level === "blocker"))
        throw new UserError(
          "Resolve the release blockers before completing review.",
        );
      const required = report.findings
        .filter((f) => f.level === "review")
        .map((f) => f.id);
      if (
        new Set(input.acknowledged).size !== input.acknowledged.length ||
        input.acknowledged.some((id) => !required.includes(id)) ||
        required.some((id) => !input.acknowledged.includes(id))
      )
        throw new UserError(
          "Review and acknowledge every teaching-quality finding, or address it in the course.",
        );
      const review = {
        id: randomUUID(),
        hash: report.hash,
        revision: report.revision,
        reviewedAt: new Date().toISOString(),
        acknowledged: input.acknowledged,
      };
      this.app.store.put(`academy:review:${id}`, review);
      return { ...report, review };
    });
  }
  release(id: string, raw: unknown) {
    const input = z
      .object({
        expectedRevision: z.number().int().positive(),
        reviewHash: z.string().length(64),
        approve: z.literal(true),
      })
      .strict()
      .parse(raw);
    return this.app.store.transaction(() => {
      const report = this.audit(id);
      if (
        !report.review ||
        report.hash !== input.reviewHash ||
        report.revision !== input.expectedRevision
      )
        throw new UserError(
          "Complete the current course review before releasing this exact revision.",
          409,
        );
      const release = this.expansion.release(id, {
        expectedRevision: input.expectedRevision,
        approve: true,
      });
      this.app.store.put(`academy:release-review:${release.id}`, report.review);
      return release;
    });
  }
  routes() {
    const r = Router();
    r.post("/import", (req, res) => res.json(importAcademy(req.body)));
    r.get("/courses/:id/audit", (req, res) =>
      res.json(this.audit(req.params.id)),
    );
    r.post("/courses/:id/review", (req, res) =>
      res.json(this.review(req.params.id, req.body)),
    );
    r.post("/courses/:id/release", (req, res) =>
      res.json(this.release(req.params.id, req.body)),
    );
    r.get("/courses/:id/export", (req, res) =>
      res.json({
        format: "outclass-academy",
        version: 1,
        course: courseContent(this.course(req.params.id)),
      }),
    );
    return r;
  }
}
