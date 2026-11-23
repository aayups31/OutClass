import { createHash, randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { Application } from "./application.js";
import type { CourseRelease } from "../expansion-contract.js";
import { CourseSandbox, type SandboxReport } from "./course-sandbox.js";
import { Workspace } from "./workspace.js";
import { UserError, assertClean } from "./safety.js";
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Submission = {
  id: string;
  requestHash: string;
  releaseHash: string;
  submissionHash: string;
  at: string;
  files: { path: string; content: string; version: string }[];
  evidence: string[];
  selfReviewed: boolean;
  check?: SandboxReport;
  checkError?: string;
};
export class CourseSubmissions {
  private active = new Set<string>();
  constructor(
    private app: Application,
    private sandbox = new CourseSandbox(),
  ) {}
  private context(courseId: string, lessonId: string) {
    const binding = this.app.store.get<{ release: CourseRelease }>(
        `academy:delivery:${courseId}`,
      ),
      index = Number(/^lesson-(\d+)$/.exec(lessonId)?.[1]),
      lesson = binding?.release.lessons[index];
    if (!binding || !lesson?.learn)
      throw new UserError("Open an available Academy assignment.", 404);
    return {
      release: binding.release,
      lesson,
      key: `academy:submissions:${courseId}:${lessonId}`,
    };
  }
  async view(courseId: string, lessonId: string) {
    const { release, lesson, key } = this.context(courseId, lessonId),
      session = this.app.store.state().session;
    const history = this.app.store.get<Submission[]>(key) || [];
    const current =
      session?.courseId === courseId && session.lessonId === lessonId
        ? await new Workspace(this.app).versions(session.id)
        : {};
    return {
      releaseHash: release.hash,
      rubric: lesson.rubric || [],
      checkAvailable: !!lesson.codeCheck,
      backend:
        process.env.OUTCLASS_SANDBOX_BACKEND === "vercel"
          ? "Vercel Sandbox"
          : "local Docker",
      history: history.map(({ files, ...submission }) => ({
        ...submission,
        files: files.map(({ path, version }) => ({ path, version })),
        stale: files.some(
          (file) =>
            current[`assignments/${lessonId}/${file.path}`] !== file.version,
        ),
        state: submission.check?.verified
          ? "automatically_checked"
          : submission.selfReviewed
            ? "self_reviewed"
            : "attempted",
      })),
    };
  }
  async submit(courseId: string, lessonId: string, raw: unknown) {
    const input = z
        .object({
          requestId: z.string().uuid(),
          releaseHash: z.string().length(64),
          expectedCount: z.number().int().min(0),
          evidence: z.array(z.string().trim().max(2000)).max(8),
          selfReviewed: z.boolean(),
          runChecks: z.boolean(),
        })
        .strict()
        .parse(raw),
      { release, lesson, key } = this.context(courseId, lessonId),
      session = this.app.configured().session;
    if (session?.courseId !== courseId || session.lessonId !== lessonId)
      throw new UserError("Open this assignment before submitting it.");
    const history = this.app.store.get<Submission[]>(key) || [],
      previous = history.find((item) => item.id === input.requestId);
    if (previous) {
      if (previous.requestHash !== hash(input))
        throw new UserError(
          "This request ID was already used with different submission details.",
          409,
        );
      return this.view(courseId, lessonId);
    }
    if (this.active.has(key))
      throw new UserError("This submission is still being checked.", 409);
    if (
      input.releaseHash !== release.hash ||
      input.expectedCount !== history.length
    )
      throw new UserError(
        "The assignment or submission history changed. Reload it.",
        409,
      );
    if (history.length >= 50)
      throw new UserError(
        "Export this assignment's evidence before recording more than 50 submissions.",
      );
    if (
      input.evidence.length !== (lesson.rubric || []).length ||
      (input.selfReviewed && input.evidence.some((text) => text.length < 20))
    )
      throw new UserError(
        "Explain the observed evidence for every rubric criterion before marking a self-review.",
      );
    assertClean(JSON.stringify(input.evidence), "rubric evidence");
    const workspace = new Workspace(this.app),
      files = [];
    for (const starter of lesson.learn!.starterFiles) {
      const file = await workspace.read(
        session.id,
        `assignments/${lessonId}/${starter.path}`,
      );
      if (this.app.apiKey && file.content.includes(this.app.apiKey))
        throw new UserError(
          "Remove credentials from the assignment before submitting it.",
        );
      assertClean(file.content, "submission file");
      files.push({
        path: starter.path,
        content: file.content,
        version: file.version,
      });
    }
    if (files.reduce((sum, file) => sum + file.content.length, 0) > 200000)
      throw new UserError(
        "Keep an assignment submission under 200,000 characters.",
      );
    const submission: Submission = {
      id: input.requestId,
      requestHash: hash(input),
      releaseHash: release.hash,
      submissionHash: hash({ releaseHash: release.hash, files }),
      at: new Date().toISOString(),
      files,
      evidence: input.evidence,
      selfReviewed: input.selfReviewed,
    };
    if (this.active.has(key))
      throw new UserError("This submission is still being checked.", 409);
    this.active.add(key);
    try {
      if (input.runChecks) {
        if (!lesson.codeCheck)
          throw new UserError(
            "This lesson has no released isolated-check contract.",
          );
        const source = files.find(
          (file) => file.path === lesson.codeCheck!.sourcePath,
        );
        if (!source)
          throw new UserError("The released source file is missing.");
        // Test code and fixtures come from the immutable release, never the learner's editable copies.
        try {
          submission.check = await this.sandbox.check({
            ...lesson.codeCheck,
            files: lesson.learn!.starterFiles.map((file) =>
              file.path === source.path
                ? { path: source.path, content: source.content }
                : file,
            ),
          });
        } catch (error) {
          submission.checkError = (error as Error).message;
        }
      }
      const current = this.app.store.get<Submission[]>(key) || [];
      if (current.length !== history.length)
        throw new UserError(
          "Submission history changed during verification.",
          409,
        );
      this.app.store.put(key, [...current, submission]);
    } finally {
      this.active.delete(key);
    }
    return this.view(courseId, lessonId);
  }
  routes() {
    const router = Router();
    router.get("/", async (req, res) =>
      res.json(
        await this.view(
          z.string().parse(req.query.courseId),
          z.string().parse(req.query.lessonId),
        ),
      ),
    );
    router.post("/", async (req, res) => {
      const input = z
        .object({
          courseId: z.string(),
          lessonId: z.string(),
          submission: z.unknown(),
        })
        .strict()
        .parse(req.body);
      res.json(
        await this.submit(input.courseId, input.lessonId, input.submission),
      );
    });
    return router;
  }
}
