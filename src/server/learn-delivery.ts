import { z } from "zod";
import type { Application } from "./application.js";
import type { CourseRelease } from "../expansion-contract.js";
import { Workspace } from "./workspace.js";
import { UserError, assertClean } from "./safety.js";
type Progress = {
  revision: number;
  checked: number[];
  reflection: string;
  revealedHints: number;
  reviewedAt?: string;
};
type Binding = { release: CourseRelease; preview: boolean };
export class LearnDelivery {
  constructor(private app: Application) {}
  bind(courseId: string, release: CourseRelease, preview = false) {
    const old = this.app.store.get<Binding>(`academy:delivery:${courseId}`);
    if (old && old.release.hash !== release.hash)
      throw new UserError(
        "This Learn course is pinned to a different release.",
        409,
      );
    this.app.store.put(`academy:delivery:${courseId}`, { release, preview });
  }
  snapshot(courseId: string, lessonId: string) {
    const binding = this.app.store.get<Binding>(`academy:delivery:${courseId}`),
      index = Number(/^lesson-(\d+)$/.exec(lessonId)?.[1]);
    if (!binding || !Number.isInteger(index) || !binding.release.lessons[index])
      return null;
    const lesson = binding.release.lessons[index],
      plan = lesson.learn;
    if (!plan) return null;
    const progress = this.app.store.get<Progress>(
      `academy:progress:${courseId}:${lessonId}`,
    ) || { revision: 0, checked: [], reflection: "", revealedHints: 0 };
    return {
      courseId,
      lessonId,
      releaseId: binding.release.id,
      releaseHash: binding.release.hash,
      title: binding.release.title,
      lessonTitle: lesson.title,
      objective: lesson.objective,
      brief: lesson.practice,
      plan,
      project: binding.release.learningProject
        ? {
            ...binding.release.learningProject,
            milestone:
              binding.release.learningProject.milestones.find(
                (m) => m.lessonIndex === index,
              ) || null,
          }
        : null,
      progress,
      preview: binding.preview,
      assessment: "instructor_criteria_self_review" as const,
      prerequisites: plan.prerequisiteLessons.map((i) => ({
        lessonId: `lesson-${i}`,
        title: binding.release.lessons[i]?.title || "Unavailable",
        reviewed: !!this.app.store.get<Progress>(
          `academy:progress:${courseId}:lesson-${i}`,
        )?.reviewedAt,
      })),
    };
  }
  async seed(courseId: string, lessonId: string) {
    const value = this.snapshot(courseId, lessonId),
      session = this.app.configured().session;
    if (
      !value ||
      session?.courseId !== courseId ||
      session.lessonId !== lessonId
    )
      return;
    const workspace = new Workspace(this.app),
      prefix = `assignments/${lessonId}/`,
      results: { path: string; status: "created" | "preserved" }[] = [];
    const { plan } = value;
    const files = [
      ...plan.starterFiles,
      {
        path: "LEARN_BRIEF.md",
        content: `# ${value.lessonTitle}\n\n${value.objective}\n\n${value.brief}\n\n## Acceptance criteria\n${plan.acceptanceCriteria.map((c) => `- ${c}`).join("\n")}\n\n## Reflection\n${plan.reflection}\n\n## Apply it differently\n${plan.transferChallenge}\n\nInstructor-authored assignment, release ${value.releaseId}. Self-review is not automated grading. Starter files are never executed automatically.\n`,
      },
    ];
    if (value.project)
      files.push({
        path: "PROJECT_CONNECTION.md",
        content:
          `# ${value.project.title}\n\n${value.project.problem}\n\n## Final deliverable\n${value.project.deliverable}\n\n` +
          (value.project.milestone
            ? `## This lesson’s increment: ${value.project.milestone.title}\n${value.project.milestone.brief}\n\n${value.project.milestone.acceptanceCriteria.map((c) => `- ${c}`).join("\n")}\n\n`
            : "") +
          `## Project path\n${value.project.milestones.map((m) => `- Lesson ${m.lessonIndex + 1}: ${m.title}`).join("\n")}\n\nYour project folder is shared across this released course. Existing files are preserved.\n`,
      });
    for (const file of files) {
      try {
        await workspace.save(
          session.id,
          prefix + file.path,
          file.content,
          null,
        );
        results.push({ path: prefix + file.path, status: "created" });
      } catch (error) {
        if (error instanceof UserError && error.status === 409)
          results.push({ path: prefix + file.path, status: "preserved" });
        else throw error;
      }
    }
    return results;
  }
  save(courseId: string, lessonId: string, raw: unknown) {
    const input = z
      .object({
        expectedRevision: z.number().int().min(0),
        checked: z.array(z.number().int().min(0).max(11)).max(12),
        reflection: z.string().trim().max(4000),
        reviewed: z.boolean(),
      })
      .strict()
      .parse(raw);
    assertClean(input.reflection, "assignment reflection");
    return this.app.store.transaction(() => {
      const value = this.snapshot(courseId, lessonId);
      if (!value)
        throw new UserError(
          "This lesson has no instructor-authored Learn package.",
          404,
        );
      if (input.expectedRevision !== value.progress.revision)
        throw new UserError(
          "This review changed in another window. Reload it first.",
          409,
        );
      if (
        new Set(input.checked).size !== input.checked.length ||
        input.checked.some((i) => i >= value.plan.acceptanceCriteria.length)
      )
        throw new UserError("Choose valid acceptance criteria.");
      if (
        input.reviewed &&
        (input.checked.length !== value.plan.acceptanceCriteria.length ||
          input.reflection.length < 20)
      )
        throw new UserError(
          "Check every criterion and explain your result in at least 20 characters before completing your self-review.",
        );
      const progress: Progress = {
        revision: value.progress.revision + 1,
        checked: input.checked,
        reflection: input.reflection,
        revealedHints: value.progress.revealedHints,
        ...(input.reviewed ? { reviewedAt: new Date().toISOString() } : {}),
      };
      this.app.store.put(`academy:progress:${courseId}:${lessonId}`, progress);
      return this.snapshot(courseId, lessonId);
    });
  }
  hint(courseId: string, lessonId: string) {
    return this.app.store.transaction(() => {
      const value = this.snapshot(courseId, lessonId);
      if (!value) throw new UserError("Assignment not available.", 404);
      const progress = {
        ...value.progress,
        revision: value.progress.revision + 1,
        revealedHints: Math.min(
          value.plan.hints.length,
          value.progress.revealedHints + 1,
        ),
      };
      this.app.store.put(`academy:progress:${courseId}:${lessonId}`, progress);
      return this.snapshot(courseId, lessonId);
    });
  }
  teacherContext(courseId: string, lessonId: string) {
    const value = this.snapshot(courseId, lessonId);
    if (!value) return undefined;
    return {
      source: "instructor-authored Learn package",
      objective: value.objective,
      brief: value.brief,
      project: value.project
        ? {
            title: value.project.title,
            problem: value.project.problem,
            deliverable: value.project.deliverable,
            milestone: value.project.milestone,
          }
        : null,
      acceptanceCriteria: value.plan.acceptanceCriteria,
      revealedHints: value.plan.hints.slice(0, value.progress.revealedHints),
      reflectionPrompt: value.plan.reflection,
      minutes: value.plan.minutes,
      selfReview: value.progress.reviewedAt
        ? "learner-reported, not verified mastery"
        : "in progress",
      prerequisites: value.prerequisites,
    };
  }
}
