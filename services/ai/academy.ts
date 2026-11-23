import { Router } from "express";
import type { ErrorRequestHandler } from "express";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import {
  courseDraft,
  type AcademyDraft,
} from "../../src/expansion-contract.js";
import { validateCourse, auditAcademy } from "../../src/academy-quality.js";
import { assertClean, UserError } from "../../src/server/safety.js";
import { COURSE_LESSON_LIMIT } from "../../src/course-limits.js";
import { HostedAcademyMedia } from "./academy-media.js";
import { assessmentKey } from "../../src/course-workshop-contract.js";
import { HostedCourseAssessment } from "./academy-assessment.js";
import { courseManifest, lessonHash } from "../../src/server/course-content.js";
import { HostedAcademyTransfer, TRANSFER_CHUNK } from "./academy-transfer.js";
const publication = z
  .object({
    releaseId: z.string().uuid(),
    lineageId: z.string().uuid(),
    revision: z.number().int().positive(),
    course: courseDraft,
    projectTemplate: z.enum(["python_activity_api_v1"]).nullable(),
    approvePublicRelease: z.literal(true),
    review: z
      .object({
        courseHash: z.string().length(64),
        acknowledged: z.array(z.string()).max(2000),
      })
      .strict(),
    privateKeys: z.array(assessmentKey).max(800).default([]),
  })
  .strict();
const errors: ErrorRequestHandler = (error, _req, res, next) => {
  if (error instanceof UserError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof z.ZodError) {
    res
      .status(400)
      .json({ error: "Check the course fields and approval before retrying." });
    return;
  }
  next(error);
};
export type HostedCourse = {
  id: string;
  title: string;
  revision: number;
  createdAt: string;
  audience: string;
  outcome: string;
  lessons: { title: string; objective: string; practice: string }[];
  lessonCount: number;
  preview: string;
  priceMinor: 0;
  projectTemplate: "python_activity_api_v1" | null;
};
export class HostedAcademy {
  readonly media = new HostedAcademyMedia(this);
  constructor(private pool: Pool) {}
  async scoped<T>(
    actor: string | null,
    fn: (client: PoolClient) => Promise<T>,
  ) {
    if (actor) z.string().uuid().parse(actor);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('outclass.actor_id',$1,true)", [
        actor || "",
      ]);
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
  private project(row: any, compact = false): HostedCourse {
    const course = row.body.course as AcademyDraft;
    return {
      id: row.id,
      title: row.title,
      revision: row.revision,
      createdAt: row.created_at,
      audience: course.audience,
      outcome: course.outcome,
      lessonCount: course.lessons.length,
      lessons: (compact ? course.lessons.slice(0, 8) : course.lessons).map(
        (l) => ({
          title: l.title,
          chapter: l.chapter,
          objective: l.objective,
          practice: l.practice,
        }),
      ),
      preview: course.lessons[0]?.content.slice(0, 1200) || "",
      priceMinor: 0,
      projectTemplate: row.body.projectTemplate,
    };
  }
  catalog() {
    return this.scoped(null, async (db) => {
      const { rows } = await db.query(
        "SELECT DISTINCT ON(author_id,lineage_id) id,title,revision,body,created_at FROM outclass_platform.courses WHERE status='published' ORDER BY author_id,lineage_id,revision DESC LIMIT 100",
      );
      return rows.map((r) => this.project(r, true));
    });
  }
  detail(id: string) {
    z.string().uuid().parse(id);
    return this.scoped(null, async (db) => {
      const { rows } = await db.query(
        "SELECT id,title,revision,body,created_at FROM outclass_platform.courses WHERE id=$1 AND status='published'",
        [id],
      );
      if (!rows.length)
        throw new UserError("This course is not publicly available.", 404);
      return this.project(rows[0]);
    });
  }
  mine(actor: string) {
    return this.scoped(actor, async (db) => {
      const { rows } = await db.query(
        "SELECT c.id,c.title,c.revision,c.status,c.created_at,(SELECT count(*)::int FROM outclass_platform.enrollments e WHERE e.course_id=c.id) AS enrollments FROM outclass_platform.courses c WHERE c.author_id=$1 ORDER BY c.created_at DESC LIMIT 100",
        [actor],
      );
      return rows;
    });
  }
  publish(actor: string, raw: unknown) {
    const value = publication.parse(raw),
      validation = validateCourse(value.course);
    if (!validation.valid) throw new UserError(validation.issues.join(" "));
    const items = value.course.lessons.flatMap(
      (lesson) => lesson.assessments || [],
    );
    if (
      new Set(items.map((item) => item.id)).size !== items.length ||
      value.privateKeys.length !== items.length ||
      new Set(value.privateKeys.map((key) => key.itemId)).size !==
        items.length ||
      items.some((item) => {
        const key = value.privateKeys.find((key) => key.itemId === item.id);
        return (
          !key ||
          key.correctChoice >= item.choices.length ||
          key.feedback.length !== item.choices.length
        );
      })
    )
      throw new UserError(
        "Supply exactly one matching private grading key for every assessment item.",
      );
    const audit = auditAcademy({
      ...value.course,
      id: value.releaseId,
      revision: value.revision,
      updatedAt: "publication",
    });
    const required = audit.findings
      .filter((f) => f.level === "review")
      .map((f) => f.id);
    if (
      audit.findings.some((f) => f.level === "blocker") ||
      value.review.courseHash !== audit.courseHash ||
      required.some((id) => !value.review.acknowledged.includes(id)) ||
      value.review.acknowledged.some((id) => !required.includes(id))
    )
      throw new UserError(
        "Complete review of this exact course content before publication.",
        409,
      );
    assertClean(JSON.stringify(value.course), "public course");
    const manifest = courseManifest(value.course);
    if (Buffer.byteLength(JSON.stringify(manifest)) > 1500000)
      throw new UserError(
        "This course manifest exceeds 1.5 MB. Split its design metadata into separate course modules; teaching content is stored separately.",
      );
    const body = {
        course: manifest,
        projectTemplate: value.projectTemplate,
      },
      hash = createHash("sha256")
        .update(JSON.stringify({ body, privateKeys: value.privateKeys }))
        .digest("hex");
    return this.scoped(actor, async (db) => {
      await this.media.assertUploaded(
        db,
        value.course.lessons.flatMap((lesson) => lesson.resources || []),
        actor,
      );
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,27))", [
        actor,
      ]);
      const existing = await db.query(
        "SELECT id,status,revision,body_hash FROM outclass_platform.courses WHERE author_id=$1 AND lineage_id=$2 AND revision=$3",
        [actor, value.lineageId, value.revision],
      );
      if (existing.rows.length) {
        if (existing.rows[0].body_hash !== hash)
          throw new UserError(
            "Create a new version for changed course content.",
            409,
          );
        return {
          id: existing.rows[0].id,
          status: existing.rows[0].status,
          revision: existing.rows[0].revision,
        };
      }
      const count = await db.query(
        "SELECT count(*)::int AS total FROM outclass_platform.courses WHERE author_id=$1",
        [actor],
      );
      if (count.rows[0].total >= 50)
        throw new UserError(
          "This creator beta supports 50 released course versions.",
        );
      await db.query(
        "INSERT INTO outclass_platform.courses(id,author_id,lineage_id,revision,title,body,body_hash,status) VALUES($1,$2,$3,$4,$5,$6,$7,'published') ON CONFLICT DO NOTHING",
        [
          value.releaseId,
          actor,
          value.lineageId,
          value.revision,
          value.course.title,
          JSON.stringify(body),
          hash,
        ],
      );
      const { rows } = await db.query(
        "SELECT id,title,revision,status,body_hash FROM outclass_platform.courses WHERE author_id=$1 AND lineage_id=$2 AND revision=$3",
        [actor, value.lineageId, value.revision],
      );
      if (!rows.length || rows[0].body_hash !== hash)
        throw new UserError(
          "This version conflicts with an existing immutable release. Create a new local version.",
          409,
        );
      for (const [position, lesson] of value.course.lessons.entries())
        await db.query(
          "INSERT INTO outclass_platform.course_lesson_content(course_id,position,hash,body) VALUES($1,$2,$3,$4)",
          [
            value.releaseId,
            position,
            lessonHash(lesson),
            JSON.stringify(lesson),
          ],
        );
      for (const resource of value.course.lessons.flatMap(
        (lesson) => lesson.resources || [],
      ))
        await db.query(
          "INSERT INTO outclass_platform.course_media(course_id,asset_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [value.releaseId, resource.id],
        );
      if (value.privateKeys.length)
        await db.query(
          "INSERT INTO outclass_platform.assessment_banks(course_id,author_id,keys) VALUES($1,$2,$3)",
          [value.releaseId, actor, JSON.stringify(value.privateKeys)],
        );
      return {
        id: rows[0].id,
        status: rows[0].status,
        revision: rows[0].revision,
      };
    });
  }
  withdraw(actor: string, id: string) {
    z.string().uuid().parse(id);
    return this.scoped(actor, async (db) => {
      const result = await db.query(
        "UPDATE outclass_platform.courses SET status='withdrawn' WHERE id=$1 AND author_id=$2 RETURNING id,status",
        [id, actor],
      );
      if (!result.rows.length)
        throw new UserError("Only this course's creator can withdraw it.", 403);
      return result.rows[0];
    });
  }
  enroll(actor: string, id: string) {
    z.string().uuid().parse(id);
    return this.scoped(actor, async (db) => {
      const course = await db.query(
        "SELECT id FROM outclass_platform.courses WHERE id=$1 AND status='published'",
        [id],
      );
      if (!course.rows.length) throw new UserError("Course unavailable.", 404);
      await db.query(
        "INSERT INTO outclass_platform.enrollments(user_id,course_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [actor, id],
      );
      const result = await db.query(
        "SELECT course_id,enrolled_at FROM outclass_platform.enrollments WHERE user_id=$1 AND course_id=$2",
        [actor, id],
      );
      return { enrolled: true, ...result.rows[0] };
    });
  }
  grant(actor: string, id: string, index: number) {
    z.string().uuid().parse(id);
    z.number()
      .int()
      .min(0)
      .max(COURSE_LESSON_LIMIT - 1)
      .parse(index);
    return this.scoped(actor, async (db) => {
      const enrolled = await db.query(
        "SELECT c.body FROM outclass_platform.courses c JOIN outclass_platform.enrollments e ON e.course_id=c.id WHERE c.id=$1 AND e.user_id=$2 AND c.status='published'",
        [id, actor],
      );
      if (!enrolled.rows[0]?.body.course.lessons[index])
        throw new UserError(
          "Enroll in this course and choose an available lesson.",
          403,
        );
      await db.query(
        "DELETE FROM outclass_platform.launch_grants WHERE user_id=$1 AND expires_at<now()",
        [actor],
      );
      const count = await db.query(
        "SELECT count(*)::int AS total FROM outclass_platform.launch_grants WHERE user_id=$1 AND consumed_at IS NULL",
        [actor],
      );
      if (count.rows[0].total >= 12)
        throw new UserError(
          "Use an existing launch code before requesting another.",
        );
      const token = randomBytes(32).toString("hex"),
        hash = createHash("sha256").update(token).digest("hex");
      await db.query(
        "INSERT INTO outclass_platform.launch_grants(token_hash,user_id,course_id,lesson_index,expires_at) VALUES($1,$2,$3,$4,now()+interval '5 minutes')",
        [hash, actor, id, index],
      );
      return {
        contractVersion: 1,
        grant: token,
        expiresInSeconds: 300,
        scopes: ["read_assignment"],
        note: "Use this code in Learn while signed in to the same account. No progress or code is uploaded.",
      };
    });
  }
  redeem(actor: string, token: string) {
    z.string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(token);
    const hash = createHash("sha256").update(token).digest("hex");
    return this.scoped(actor, async (db) => {
      const granted = await db.query(
        "UPDATE outclass_platform.launch_grants SET consumed_at=now() WHERE token_hash=$1 AND user_id=$2 AND consumed_at IS NULL AND expires_at>now() RETURNING course_id,lesson_index",
        [hash, actor],
      );
      if (!granted.rows.length)
        throw new UserError(
          "This code has expired, was consumed or belongs to another account.",
          403,
        );
      const grant = granted.rows[0],
        course = await db.query(
          "SELECT c.id,c.title,c.revision,c.lineage_id,c.body FROM outclass_platform.courses c JOIN outclass_platform.enrollments e ON e.course_id=c.id WHERE c.id=$1 AND e.user_id=$2 AND c.status='published'",
          [grant.course_id, actor],
        );
      if (!course.rows.length)
        throw new UserError("Course access is no longer available.", 403);
      const row = course.rows[0];
      const hydrated = row.body.course;
      let lessonContent: { hash: string; bytes: number }[] | undefined;
      if (hydrated.lessonHashes) {
        const content = await db.query(
          "SELECT position,hash,body FROM outclass_platform.course_lesson_content WHERE course_id=$1 ORDER BY position",
          [row.id],
        );
        if (
          content.rows.length !== hydrated.lessonHashes.length ||
          content.rows.some(
            (item, index) =>
              item.position !== index ||
              item.hash !== hydrated.lessonHashes[index] ||
              lessonHash(item.body) !== item.hash,
          )
        )
          throw new UserError(
            "Course content is incomplete or corrupt. Contact its educator.",
            503,
          );
        lessonContent = content.rows.map((item) => ({
          hash: item.hash,
          bytes: Buffer.byteLength(JSON.stringify(item.body)),
        }));
      }
      return {
        contractVersion: 1,
        id: row.id,
        lineageId: row.lineage_id,
        title: row.title,
        revision: row.revision,
        lessonIndex: grant.lesson_index,
        course: hydrated,
        ...(lessonContent ? { lessonContent } : {}),
        projectTemplate: row.body.projectTemplate,
        scopes: ["read_assignment"],
      };
    });
  }
  async lessonChunk(
    actor: string,
    id: string,
    index: number,
    position: number,
  ) {
    z.string().uuid().parse(id);
    z.number()
      .int()
      .min(0)
      .max(COURSE_LESSON_LIMIT - 1)
      .parse(index);
    z.number().int().min(0).max(199).parse(position);
    return this.scoped(actor, async (db) => {
      const row = (
        await db.query(
          "SELECT l.body,l.hash FROM outclass_platform.course_lesson_content l JOIN outclass_platform.courses c ON c.id=l.course_id WHERE c.id=$1 AND l.position=$2 AND c.status='published' AND (c.author_id=$3 OR EXISTS(SELECT 1 FROM outclass_platform.enrollments e WHERE e.course_id=c.id AND e.user_id=$3))",
          [id, index, actor],
        )
      ).rows[0];
      if (!row)
        throw new UserError(
          "Enroll in this published course before downloading its lessons.",
          403,
        );
      if (lessonHash(row.body) !== row.hash)
        throw new UserError("This lesson failed its integrity check.", 503);
      const bytes = Buffer.from(JSON.stringify(row.body));
      if (position * TRANSFER_CHUNK >= bytes.length)
        throw new UserError("Lesson chunk not found.", 404);
      return {
        hash: row.hash,
        base64: bytes
          .subarray(position * TRANSFER_CHUNK, (position + 1) * TRANSFER_CHUNK)
          .toString("base64"),
      };
    });
  }
  publicRoutes() {
    const router = Router();
    router.get("/catalog", async (_req, res) =>
      res.json({ courses: await this.catalog(), mode: "free_beta" }),
    );
    router.get("/courses/:id", async (req, res) =>
      res.json(await this.detail(req.params.id)),
    );
    router.use(errors);
    return router;
  }
  privateRoutes() {
    const router = Router();
    router.use("/media", this.media.routes());
    router.use("/transfers", new HostedAcademyTransfer(this).routes());
    router.get(
      "/courses/:id/lessons/:index/chunks/:position",
      async (req, res) =>
        res.json(
          await this.lessonChunk(
            res.locals.user,
            req.params.id,
            Number(req.params.index),
            Number(req.params.position),
          ),
        ),
    );
    router.use(
      "/courses/:id/assess",
      new HostedCourseAssessment(this).routes(),
    );
    router.get("/mine", async (_req, res) =>
      res.json(await this.mine(res.locals.user)),
    );
    router.post("/publish", async (req, res) =>
      res.json(await this.publish(res.locals.user, req.body)),
    );
    router.post("/courses/:id/withdraw", async (req, res) => {
      z.object({ approveWithdrawal: z.literal(true) })
        .strict()
        .parse(req.body);
      res.json(await this.withdraw(res.locals.user, req.params.id));
    });
    router.post("/courses/:id/enroll", async (req, res) => {
      z.object({}).strict().parse(req.body);
      res.json(await this.enroll(res.locals.user, req.params.id));
    });
    router.post("/courses/:id/grant", async (req, res) =>
      res.json(
        await this.grant(
          res.locals.user,
          req.params.id,
          z
            .number()
            .int()
            .min(0)
            .max(COURSE_LESSON_LIMIT - 1)
            .parse(req.body.lessonIndex),
        ),
      ),
    );
    router.post("/redeem", async (req, res) =>
      res.json(
        await this.redeem(res.locals.user, z.string().parse(req.body.grant)),
      ),
    );
    router.use(errors);
    return router;
  }
}
