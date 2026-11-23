import {courseContent,auditAcademy} from '../academy-quality.js';
export {courseContent,auditAcademy} from '../academy-quality.js';
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
  COURSE_IMPORT_CHAR_LIMIT,
  COURSE_LESSON_LIMIT,
  COURSE_SOURCE_LIMIT,
} from "../course-limits.js";
import { learnPackageIssues } from "../learn-package-contract.js";
import type { Application } from "./application.js";
import type { Expansion } from "./expansion.js";
import { assertClean, UserError } from "./safety.js";
import { CourseResearch } from "./course-research.js";
const digest = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function importAcademy(raw: unknown) {
  const input = z
    .object({
      name: z.string().min(1).max(180),
      text: z.string().max(COURSE_IMPORT_CHAR_LIMIT),
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
    let chapter: string | undefined;
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
        const section = /^##\s+(?:Chapter|Section):\s*(.+)$/i.exec(line);
        if (section) {
          chapter = section[1].trim();
          lesson = undefined;
          continue;
        }
        const heading = (
          chapter
            ? /^###\s+(?:Lesson\s*(?:\d+)?\s*[:.—-]\s*)?(.+)$/i
            : /^##\s+(?:Lesson\s*(?:\d+)?\s*[:.—-]\s*)?(.+)$/i
        ).exec(line);
        if (heading) {
          lesson = {
            title: heading[1].trim(),
            objective: "",
            practice: "",
            content: "",
            ...(chapter ? { chapter } : {}),
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
  if (JSON.stringify(result).length > COURSE_CHAR_LIMIT)
    throw new UserError(
      `Keep imported course content under ${COURSE_CHAR_LIMIT.toLocaleString()} characters. Split the course or use linked resources; nothing was truncated.`,
    );
  result.rightsConfirmed = false;
  for (const lesson of result.lessons)
    if (lesson.references)
      lesson.references = lesson.references.map((reference) => ({
        ...reference,
        approved: false,
      }));
  return {
    course: result,
    hash: digest(result),
    warnings: [
      "Review the imported material and confirm your permission before release.",
    ],
    format: "outclass-academy" as const,
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
    const researchIssues = new CourseResearch(this.app).issues(this.course(id));
    report.findings.push(
      ...researchIssues.map((issue, index) => ({
        id: `research:${index}`,
        level: "blocker" as const,
        field: "references",
        title: "Recheck source permission and version",
        detail: issue.detail,
        lessonIndex: issue.lessonIndex,
      })),
    );
    if (researchIssues.length)
      report.hash = digest({ base: report.hash, researchIssues });
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
