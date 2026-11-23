import { Router } from "express";
import { z } from "zod";
import type { HostedAcademy } from "./academy.js";
import { assessmentKey } from "../../src/course-workshop-contract.js";
import type { AcademyDraft } from "../../src/expansion-contract.js";
import { UserError } from "../../src/server/safety.js";
export class HostedCourseAssessment {
  constructor(private academy: HostedAcademy) {}
  async view(actor: string, id: string) {
    z.string().uuid().parse(id);
    return this.academy.scoped(actor, async (db) => {
      const allowed = (
        await db.query(
          "SELECT c.id FROM outclass_platform.courses c WHERE c.id=$1 AND c.status='published' AND (c.author_id=$2 OR EXISTS(SELECT 1 FROM outclass_platform.enrollments e WHERE e.course_id=c.id AND e.user_id=$2))",
          [id, actor],
        )
      ).rows[0];
      if (!allowed)
        throw new UserError(
          "Enroll in this published course before checking answers.",
          403,
        );
      return {
        attempts: (
          await db.query(
            "SELECT result FROM outclass_platform.course_attempts WHERE course_id=$1 AND user_id=$2 ORDER BY created_at,id",
            [id, actor],
          )
        ).rows.map((row) => row.result),
      };
    });
  }
  async submit(actor: string, id: string, raw: unknown) {
    z.string().uuid().parse(id);
    const input = z
      .object({
        requestId: z.string().uuid(),
        itemId: z.string().max(100),
        choice: z.number().int().min(0).max(5),
        expectedAttempt: z.number().int().min(0).max(1000),
      })
      .strict()
      .parse(raw);
    return this.academy.scoped(actor, async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,37))", [
        `${actor}:${id}`,
      ]);
      const course = (
        await db.query(
          "SELECT c.body FROM outclass_platform.courses c WHERE c.id=$1 AND c.status='published' AND (c.author_id=$2 OR EXISTS(SELECT 1 FROM outclass_platform.enrollments e WHERE e.course_id=c.id AND e.user_id=$2))",
          [id, actor],
        )
      ).rows[0];
      if (!course)
        throw new UserError(
          "Enroll in this published course before checking answers.",
          403,
        );
      const prior = (
        await db.query(
          "SELECT result FROM outclass_platform.course_attempts WHERE course_id=$1 AND user_id=$2 AND id=$3",
          [id, actor, input.requestId],
        )
      ).rows[0];
      if (prior) return prior.result;
      const lessons = course.body.course.lessonHashes
        ? (
            await db.query(
              "SELECT body->'assessments' AS items FROM outclass_platform.course_lesson_content WHERE course_id=$1",
              [id],
            )
          ).rows.map((row) => ({ assessments: row.items || [] }))
        : (course.body.course as AcademyDraft).lessons;
      const item = (lessons as AcademyDraft["lessons"])
        .flatMap((lesson) => lesson.assessments || [])
        .find((item) => item.id === input.itemId);
      if (!item || input.choice >= item.choices.length)
        throw new UserError("Choose an available assessment item and answer.");
      await db.query("SELECT set_config('outclass.grading_course',$1,true)", [
        id,
      ]);
      const bank = (
        await db.query(
          "SELECT keys FROM outclass_platform.assessment_banks WHERE course_id=$1",
          [id],
        )
      ).rows[0];
      const answer = z
        .array(assessmentKey)
        .parse(bank?.keys || [])
        .find((key) => key.itemId === input.itemId);
      if (!answer)
        throw new UserError("This item has no published grading key.", 409);
      const counts = (
        await db.query(
          "SELECT count(*)::int AS total,count(*) FILTER(WHERE (result->>'correct')::boolean)::int AS correct FROM outclass_platform.course_attempts WHERE course_id=$1 AND user_id=$2 AND item_id=$3",
          [id, actor, input.itemId],
        )
      ).rows[0];
      if (counts.total !== input.expectedAttempt)
        throw new UserError(
          "Your attempts changed on another device. Reload before submitting.",
          409,
        );
      if (counts.total >= 100)
        throw new UserError(
          "This item reached its practice-attempt limit.",
          429,
        );
      const correct = input.choice === answer.correctChoice,
        at = new Date(),
        days = correct
          ? item.reviewAfterDays[
              Math.min(counts.correct, item.reviewAfterDays.length - 1)
            ]
          : 0;
      const result = {
        itemId: item.id,
        choice: input.choice,
        correct,
        feedback: answer.feedback[input.choice],
        rationale: answer.rationale,
        remediationLessonIds: correct ? [] : item.remediationLessonIds,
        at: at.toISOString(),
        dueAt: new Date(at.getTime() + days * 86400000).toISOString(),
        attempt: counts.total + 1,
        submissionHash: input.requestId,
      };
      await db.query(
        "INSERT INTO outclass_platform.course_attempts(id,course_id,user_id,item_id,result) VALUES($1,$2,$3,$4,$5)",
        [input.requestId, id, actor, item.id, result],
      );
      return result;
    });
  }
  routes() {
    const router = Router({ mergeParams: true });
    router.get<{ id: string }>("/", async (req, res) =>
      res.json(await this.view(res.locals.user, req.params.id)),
    );
    router.post<{ id: string }>("/", async (req, res) =>
      res.json(await this.submit(res.locals.user, req.params.id, req.body)),
    );
    return router;
  }
}
