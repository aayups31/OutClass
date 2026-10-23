import { z } from "zod";
import { COURSE_LESSON_LIMIT } from "./course-limits.js";
const text = (max: number) => z.string().trim().max(max);
export const learningProject = z
  .object({
    title: text(200),
    problem: text(2000),
    deliverable: text(2000),
    milestones: z
      .array(
        z
          .object({
            lessonIndex: z
              .number()
              .int()
              .min(0)
              .max(COURSE_LESSON_LIMIT - 1),
            title: text(200),
            brief: text(2000),
            acceptanceCriteria: z.array(text(500)).max(6),
          })
          .strict(),
      )
      .max(COURSE_LESSON_LIMIT),
  })
  .strict();
export type LearningProject = z.infer<typeof learningProject>;
export type AcademyFinding = {
  id: string;
  level: "blocker" | "review" | "suggestion";
  lessonIndex?: number;
  field: string;
  title: string;
  detail: string;
};
export type AcademyAudit = {
  hash: string;
  courseHash: string;
  revision: number;
  findings: AcademyFinding[];
  coverage: {
    lessons: number;
    assignments: number;
    reflections: number;
    transfers: number;
    minutes: number;
    milestones: number;
  };
  review?: {
    id: string;
    hash: string;
    revision: number;
    reviewedAt: string;
    acknowledged: string[];
  };
};
