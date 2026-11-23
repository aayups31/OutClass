import { createHash, randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { Application } from "./application.js";
import type { CourseRelease } from "../expansion-contract.js";
import type { AssessmentKey } from "../course-workshop-contract.js";
import { UserError } from "./safety.js";
type Attempt = {
  itemId: string;
  choice: number;
  correct: boolean;
  at: string;
  dueAt: string;
  attempt: number;
  submissionHash: string;
};
export class CourseAssessment {
  constructor(
    private app: Application,
    private now = () => new Date(),
  ) {}
  private context(courseId: string, lessonId: string) {
    const binding = this.app.store.get<{ release: CourseRelease }>(
      `academy:delivery:${courseId}`,
    );
    const index = Number(/^lesson-(\d+)$/.exec(lessonId)?.[1]);
    if (!binding || !Number.isInteger(index) || !binding.release.lessons[index])
      throw new UserError("Open an available Academy lesson first.", 404);
    return {
      release: binding.release,
      lesson: binding.release.lessons[index],
      index,
    };
  }
  view(courseId: string, lessonId: string) {
    const { release, lesson, index } = this.context(courseId, lessonId),
      attempts =
        this.app.store.get<Attempt[]>(`academy:attempts:${courseId}`) || [];
    const keys =
      this.app.store.get<AssessmentKey[]>(
        `academy:assessment-keys:${release.id}`,
      ) || [];
    const known = new Set(lesson.assessments?.map((item) => item.id) || []);
    return {
      releaseId: release.id,
      releaseHash: release.hash,
      reviewQueue: release.lessons
        .slice(0, index)
        .flatMap((lesson, lessonIndex) => {
          const due = (lesson.assessments || []).filter((item) => {
            const last = attempts
              .filter((attempt) => attempt.itemId === item.id)
              .at(-1);
            return !!last && last.dueAt <= this.now().toISOString();
          });
          return due.length
            ? [
                {
                  lessonId: `lesson-${lessonIndex}`,
                  title: lesson.title,
                  due: due.length,
                },
              ]
            : [];
        }),
      items: (lesson.assessments || []).map((item) => {
        const history = attempts.filter(
          (attempt) => attempt.itemId === item.id,
        );
        const last = history.at(-1);
        return {
          ...item,
          attempts: history.length,
          lastResult: last
            ? { correct: last.correct, at: last.at, dueAt: last.dueAt }
            : null,
          due: !last || last.dueAt <= this.now().toISOString(),
          remediation:
            last && !last.correct
              ? item.remediationLessonIds.flatMap((id) => {
                  const index =
                    release.design?.plan.lessons.findIndex(
                      (lesson) => lesson.id === id,
                    ) ?? -1;
                  return index >= 0
                    ? [
                        {
                          lessonId: `lesson-${index}`,
                          title: release.lessons[index].title,
                        },
                      ]
                    : [];
                })
              : [],
          automaticCheckAvailable:
            keys.some((key) => key.itemId === item.id) ||
            !!this.app.store.get(`academy:remote:${release.id}`),
        };
      }),
      attempts: attempts.filter((attempt) => known.has(attempt.itemId)),
      assessment: "choice_checks_not_mastery",
    };
  }
  async syncRemote(courseId: string, lessonId: string) {
    const { release } = this.context(courseId, lessonId);
    if (!this.app.store.get(`academy:remote:${release.id}`)) return;
    const response = (await this.app.ai.platform(
      `courses/${release.id}/assess`,
    )) as { attempts: Attempt[] };
    const attempt = z.object({
      itemId: z.string(),
      choice: z.number().int(),
      correct: z.boolean(),
      at: z.iso.datetime(),
      dueAt: z.iso.datetime(),
      attempt: z.number().int(),
      submissionHash: z.string(),
    });
    this.app.store.put(
      `academy:attempts:${courseId}`,
      z.array(attempt).max(10000).parse(response.attempts),
    );
  }
  async submit(courseId: string, lessonId: string, raw: unknown) {
    const input = z
      .object({
        itemId: z.string(),
        choice: z.number().int().min(0).max(5),
        releaseHash: z.string().length(64),
        expectedAttempt: z.number().int().min(0),
      })
      .strict()
      .parse(raw);
    const binding = this.context(courseId, lessonId);
    if (this.app.store.get(`academy:remote:${binding.release.id}`)) {
      if (input.releaseHash !== binding.release.hash)
        throw new UserError(
          "This assessment belongs to a different release.",
          409,
        );
      const item = binding.lesson.assessments?.find(
        (item) => item.id === input.itemId,
      );
      if (!item || input.choice >= item.choices.length)
        throw new UserError("Choose an available item and answer.");
      const requestKey = `academy:submission:${createHash("sha256")
        .update(JSON.stringify({ courseId, ...input }))
        .digest("hex")}`;
      const requestId = this.app.store.get<string>(requestKey) || randomUUID();
      this.app.store.put(requestKey, requestId);
      const result = z
        .object({
          correct: z.boolean(),
          feedback: z.string(),
          rationale: z.string(),
          remediationLessonIds: z.array(z.string()),
        })
        .parse(
          await this.app.ai.platform(`courses/${binding.release.id}/assess`, {
            requestId,
            itemId: input.itemId,
            choice: input.choice,
            expectedAttempt: input.expectedAttempt,
          }),
        );
      await this.syncRemote(courseId, lessonId);
      return result;
    }
    return this.app.store.transaction(() => {
      const { release, lesson } = this.context(courseId, lessonId);
      if (input.releaseHash !== release.hash)
        throw new UserError(
          "This assessment belongs to a different course release.",
          409,
        );
      const item = lesson.assessments?.find((item) => item.id === input.itemId);
      const answer = this.app.store
        .get<AssessmentKey[]>(`academy:assessment-keys:${release.id}`)
        ?.find((key) => key.itemId === input.itemId);
      if (!item || !answer)
        throw new UserError(
          "Automatic checking is unavailable for this item.",
          409,
        );
      if (input.choice >= item.choices.length)
        throw new UserError("Choose an available answer.");
      const key = `academy:attempts:${courseId}`,
        attempts = this.app.store.get<Attempt[]>(key) || [],
        prior = attempts.filter((attempt) => attempt.itemId === item.id);
      if (prior.length !== input.expectedAttempt)
        throw new UserError(
          "This answer was already submitted. Reload the assessment.",
          409,
        );
      if (prior.length >= 100)
        throw new UserError(
          "This item has reached its 100-attempt limit. Continue with the project's independent evidence.",
        );
      const correct = input.choice === answer.correctChoice,
        at = this.now(),
        interval = correct
          ? item.reviewAfterDays[
              Math.min(
                prior.filter((attempt) => attempt.correct).length,
                item.reviewAfterDays.length - 1,
              )
            ]
          : 0;
      const row: Attempt = {
        itemId: item.id,
        choice: input.choice,
        correct,
        at: at.toISOString(),
        dueAt: new Date(at.getTime() + interval * 86400000).toISOString(),
        attempt: prior.length + 1,
        submissionHash: createHash("sha256")
          .update(
            JSON.stringify({
              release: release.hash,
              item: item.id,
              choice: input.choice,
              attempt: prior.length + 1,
            }),
          )
          .digest("hex"),
      };
      this.app.store.put(key, [...attempts, row]);
      return {
        correct,
        feedback: answer.feedback[input.choice],
        rationale: answer.rationale,
        remediationLessonIds: correct ? [] : item.remediationLessonIds,
        result: row,
        assessment: "checked_choice_not_mastery",
      };
    });
  }
  routes() {
    const router = Router();
    router.get("/", async (req, res) => {
      const courseId = z.string().parse(req.query.courseId),
        lessonId = z.string().parse(req.query.lessonId);
      await this.syncRemote(courseId, lessonId);
      res.json(this.view(courseId, lessonId));
    });
    router.post("/", async (req, res) => {
      const body = z
        .object({
          courseId: z.string(),
          lessonId: z.string(),
          submission: z.unknown(),
        })
        .strict()
        .parse(req.body);
      res.json(
        await this.app.serial(() =>
          this.submit(body.courseId, body.lessonId, body.submission),
        ),
      );
    });
    return router;
  }
}
