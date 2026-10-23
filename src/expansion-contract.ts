import { z } from "zod";
import { learnPackage } from "./learn-package-contract.js";
import { learningProject } from "./academy-design-contract.js";
import { COURSE_LESSON_LIMIT, COURSE_SOURCE_LIMIT } from "./course-limits.js";
import type { CompiledProject } from "./server/academy-compiler.js";

const text = (max = 4000) => z.string().trim().max(max);
export const academyLesson = z
  .object({
    title: text(200),
    objective: text(1000),
    practice: text(2000),
    content: text(COURSE_SOURCE_LIMIT),
    learn: learnPackage.optional(),
  })
  .strict();
export const courseDraft = z
  .object({
    title: text(200).min(1),
    audience: text(1000),
    outcome: text(2000),
    rightsConfirmed: z.boolean(),
    lessons: z.array(academyLesson).max(COURSE_LESSON_LIMIT),
    learningProject: learningProject.optional(),
  })
  .strict();
export const creativeDraft = z
  .object({
    title: text(200).min(1),
    releaseId: z.string().uuid(),
    lessonIndex: z
      .number()
      .int()
      .min(0)
      .max(COURSE_LESSON_LIMIT - 1),
    brief: text(2000),
    copy: text(8000),
    brandColor: z.string().regex(/^#[0-9a-f]{6}$/i),
    rightsConfirmed: z.boolean(),
  })
  .strict();
export const campaignDraft = z
  .object({
    title: text(200).min(1),
    creativeId: z.string().uuid(),
    destination: z.string().url().max(2000),
    source: text(100).min(1),
    medium: text(100).min(1),
    goal: text(2000),
    budgetMinor: z.number().int().min(0).max(10000000),
    currency: z.enum(["CAD", "USD", "EUR", "GBP"]),
  })
  .strict();
export type AcademyDraft = z.infer<typeof courseDraft>;
export type CreativeDraft = z.infer<typeof creativeDraft>;
export type CampaignDraft = z.infer<typeof campaignDraft>;
export type Revision<T> = T & {
  id: string;
  revision: number;
  updatedAt: string;
};
export type CourseRelease = AcademyDraft & {
  id: string;
  courseId: string;
  revision: number;
  publishedAt: string;
  hash: string;
  visibility: "local";
  project?: CompiledProject;
};
export type Creative = Revision<CreativeDraft> & {
  approval?: { hash: string; revision: number; approvedAt: string };
};
export type Campaign = Revision<CampaignDraft> & {
  creativeHash: string;
  creativeSnapshot: Creative;
  trackedUrl: string;
  status: "draft";
};
export interface ExpansionState {
  schemaVersion: 1;
  courses: Revision<AcademyDraft>[];
  releases: CourseRelease[];
  enrollments: { releaseId: string; enrolledAt: string }[];
  creatives: Creative[];
  campaigns: Campaign[];
}
