import { createHash, randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import {
  courseDraft,
  creativeDraft,
  campaignDraft,
  type AcademyDraft,
  type ExpansionState,
  type CourseRelease,
} from "../expansion-contract.js";
import type { Application } from "./application.js";
import { assertClean, slug, UserError } from "./safety.js";
import {
  AcademyCompiler,
  apiStarter,
  apiTests,
  apiServer,
  milestones,
} from "./academy-compiler.js";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { ProductAgents } from "./product-agents.js";
import { designExport } from "./creator-design.js";
import { CourseLibrary } from "./library.js";
import { learnPackageIssues } from "../learn-package-contract.js";
import { LearnDelivery } from "./learn-delivery.js";
import { AgentHandoffs, agentDomain } from "./agent-handoffs.js";
import { AgentWorkService } from "./agent-work.js";
import type { CreatorProduction } from "./creator-production.js";

const key = "expansion:v1";
const stamp = () => new Date().toISOString();
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const edit = {
  id: z.string().uuid().optional(),
  expectedRevision: z.number().int().min(0),
};
const releaseRequest = z
  .object({ expectedRevision: z.number().int(), approve: z.literal(true) })
  .strict();
export function validateCourse(course: AcademyDraft) {
  const issues: string[] = learnPackageIssues(course.lessons);
  if (!course.audience) issues.push("Describe who the course is for.");
  if (!course.outcome)
    issues.push("Define what the learner will build or demonstrate.");
  if (!course.rightsConfirmed)
    issues.push("Confirm your rights to the course material.");
  if (!course.lessons.length) issues.push("Add at least one lesson.");
  if (JSON.stringify(course).length > 300000)
    issues.push(
      "Keep a course release under 300,000 characters; split large source files into linked resources.",
    );
  course.lessons.forEach((lesson, i) => {
    for (const field of ["title", "objective", "practice", "content"] as const)
      if (!lesson[field]) issues.push(`Lesson ${i + 1}: add ${field}.`);
  });
  return {
    valid: !issues.length,
    issues,
    technicalVerification: "not_run" as const,
    scope:
      "Structure and required content only; code examples have not been executed.",
  };
}
export class Expansion {
  readonly compiler: AcademyCompiler;
  constructor(readonly app: Application) {
    this.compiler = new AcademyCompiler(app);
  }
  state(): ExpansionState {
    return (
      this.app.store.get<ExpansionState>(key) || {
        schemaVersion: 1,
        courses: [],
        releases: [],
        enrollments: [],
        creatives: [],
        campaigns: [],
      }
    );
  }
  private change<T>(fn: (state: ExpansionState) => T): T {
    let result!: T;
    this.app.store.transaction(() => {
      const state = this.state();
      result = fn(state);
      this.app.store.put(key, state);
    });
    return result;
  }
  saveCourse(raw: unknown) {
    const input = courseDraft.extend(edit).parse(raw);
    const { id, expectedRevision, ...draft } = input;
    assertClean(JSON.stringify(draft), "course draft");
    return this.change((state) => {
      const old = state.courses.find((c) => c.id === id);
      this.checkRevision(id, old?.revision, expectedRevision);
      if (!old && state.courses.length >= 40)
        throw new UserError("This local preview supports 40 course drafts.");
      const next = {
        ...draft,
        id: id || randomUUID(),
        revision: expectedRevision + 1,
        updatedAt: stamp(),
      };
      state.courses = [...state.courses.filter((c) => c.id !== id), next];
      return next;
    });
  }
  private checkRevision(
    id: string | undefined,
    actual: number | undefined,
    expected: number,
  ) {
    if ((id && actual === undefined) || (actual || 0) !== expected)
      throw new UserError(
        "This draft changed in another window. Reload it before saving.",
        409,
      );
  }
  release(id: string, raw: unknown) {
    const input = releaseRequest.parse(raw);
    return this.change((state) => {
      const draft = state.courses.find((c) => c.id === id);
      if (!draft) throw new UserError("Course draft not found.", 404);
      this.checkRevision(id, draft.revision, input.expectedRevision);
      const validation = validateCourse(draft);
      if (!validation.valid) throw new UserError(validation.issues.join(" "));
      const existing = state.releases.find(
        (r) => r.courseId === id && r.revision === draft.revision,
      );
      if (existing) return existing;
      if (state.releases.length >= 120)
        throw new UserError("The local release limit has been reached.");
      const { id: courseId, updatedAt: _at, ...content } = draft;
      const release: CourseRelease = {
        ...content,
        courseId,
        id: randomUUID(),
        publishedAt: stamp(),
        hash: hash(content),
        visibility: "local",
        ...(this.compiler.status(id)?.revision === draft.revision
          ? { project: this.compiler.status(id) }
          : {}),
      };
      state.releases.push(release);
      return release;
    });
  }
  enroll(releaseId: string) {
    return this.change((state) => {
      if (!state.releases.some((r) => r.id === releaseId))
        throw new UserError("Released course not found.", 404);
      const previous = state.enrollments.find((e) => e.releaseId === releaseId);
      if (previous) return previous;
      const enrollment = { releaseId, enrolledAt: stamp() };
      state.enrollments.push(enrollment);
      return enrollment;
    });
  }
  async publishHosted(releaseId: string) {
    const release = this.state().releases.find((r) => r.id === releaseId);
    if (!release) throw new UserError("Choose a local course release.", 404);
    const { title, audience, outcome, rightsConfirmed, lessons } = release;
    const result = await this.app.ai.platform("publish", {
      releaseId: release.id,
      lineageId: release.courseId,
      revision: release.revision,
      course: { title, audience, outcome, rightsConfirmed, lessons },
      projectTemplate: release.project?.verified
        ? "python_activity_api_v1"
        : null,
      approvePublicRelease: true,
    });
    this.app.store.put(`academy:publication:${release.id}`, result);
    return result;
  }
  async importHosted(grant: string) {
    if (this.app.configured().session)
      throw new UserError(
        "Finish or discard your current Learn session before redeeming a course code.",
        409,
      );
    const payload = z
      .object({
        contractVersion: z.literal(1),
        id: z.string().uuid(),
        title: z.string(),
        revision: z.number().int().positive(),
        lessonIndex: z.number().int().min(0).max(29),
        course: courseDraft,
        projectTemplate: z.enum(["python_activity_api_v1"]).nullable(),
        scopes: z.tuple([z.literal("read_assignment")]),
      })
      .parse(await this.app.ai.platform("redeem", { grant }));
    if (!payload.course.lessons[payload.lessonIndex])
      throw new UserError("The assignment does not contain this lesson.");
    const release: CourseRelease = {
      ...payload.course,
      id: payload.id,
      courseId: payload.id,
      revision: payload.revision,
      publishedAt: stamp(),
      hash: hash(payload.course),
      visibility: "local",
    };
    this.change((state) => {
      const existing = state.releases.find((r) => r.id === release.id);
      if (
        existing &&
        (existing.revision !== release.revision ||
          existing.hash !== release.hash)
      )
        throw new UserError(
          "This downloaded release conflicts with local content.",
          409,
        );
      if (!existing) {
        if (state.releases.length >= 120)
          throw new UserError("The local release limit has been reached.");
        state.releases.push(release);
      }
    });
    this.app.store.put(
      `academy:template:${release.id}`,
      payload.projectTemplate,
    );
    this.enroll(release.id);
    return this.launch(release.id, payload.lessonIndex);
  }
  async launch(releaseId: string, lessonIndex: number, preview = false) {
    const expansion = this.state();
    const release = expansion.releases.find((r) => r.id === releaseId);
    if (
      !release ||
      (!preview &&
        !expansion.enrollments.some((e) => e.releaseId === releaseId))
    )
      throw new UserError(
        "Enroll in this local release before opening Learn.",
        403,
      );
    const lesson = release.lessons[lessonIndex];
    if (preview && !expansion.courses.some((c) => c.id === release.courseId))
      throw new UserError(
        "Instructor preview is available for your authored local courses.",
        403,
      );
    if (!lesson) throw new UserError("Lesson not found.", 404);
    const state = this.app.configured();
    const courseId = `${preview ? "academy-preview" : "academy"}:${releaseId}`,
      lessonId = `lesson-${lessonIndex}`;
    if (state.session) {
      if (
        state.session.courseId === courseId &&
        state.session.lessonId === lessonId
      )
        return { courseId, sessionId: state.session.id };
      throw new UserError(
        "Finish or discard the current Learn session before opening this lesson.",
        409,
      );
    }
    if (!state.courses.some((c) => c.id === courseId)) {
      state.courses.push({
        id: courseId,
        platform: "academy",
        title: release.title,
        url: `https://git-learn-black.vercel.app/academy#${releaseId}`,
        path: `${preview ? "academy-preview" : "academy"}-${slug(release.title)}-${releaseId.slice(0, 8)}`,
        mirrored: false,
        observedAt: stamp(),
        lessons: release.lessons.map((l, i) => ({
          id: `lesson-${i}`,
          title: l.title,
          section: "Academy",
          order: i,
          path: `academy/${String(i + 1).padStart(2, "0")}-${slug(l.title)}`,
        })),
      });
      this.app.store.save(state);
    }
    await this.app.mirror(courseId);
    await this.app.start(courseId, lessonId);
    const delivery = new LearnDelivery(this.app);
    delivery.bind(courseId, release, preview);
    await delivery.seed(courseId, lessonId);
    if (
      release.project?.verified ||
      this.app.store.get(`academy:template:${release.id}`) ===
        "python_activity_api_v1"
    ) {
      const workspace = this.app.store.state().session!.workspace;
      const files = {
        "main.py": apiStarter,
        "test_project.py": apiTests,
        "server.py": apiServer,
        "data.json": JSON.stringify(
          [
            { user: "Ada", minutes: 25 },
            { user: "Ada", minutes: 20 },
            { user: "Bob", minutes: 12 },
          ],
          null,
          2,
        ),
        "PROJECT_BRIEF.md": `# ${release.project?.title || "Python activity API"}\n\n${milestones.map((m, i) => `## ${i + 1}. ${m.title}\n${m.objective}\n\n${m.brief}\nChecks: ${m.checks}`).join("\n\n")}\n\nRun checks: python test_project.py\nStart the local API: python server.py\nOpen http://127.0.0.1:8000/report after implementing the boundary. data.json contains illustrative sample records.\nThe reference passed 18 checks; the starter intentionally passes none. This verifies the template, not learner mastery.\n`,
      };
      for (const [name, content] of Object.entries(files))
        await writeFile(path.join(workspace, name), content, {
          flag: "wx",
        }).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "EEXIST") throw error;
        });
    }
    const library = new CourseLibrary(this.app);
    release.lessons.forEach((l, i) =>
      library.document(
        courseId,
        l.title,
        `${l.content}\n\nObjective: ${l.objective}\n\nPractice: ${l.practice}`,
        "academy",
        `lesson-${i}`,
        `${courseId}:${i}`,
        true,
      ),
    );
    await this.app.saveNote(
      `${lesson.content}\n\nObjective: ${lesson.objective}\n\nPractice: ${lesson.practice}`,
    );
    return { courseId, sessionId: this.app.store.state().session!.id };
  }
  saveCreative(raw: unknown) {
    const { id, expectedRevision, ...draft } = creativeDraft
      .extend(edit)
      .parse(raw);
    assertClean(JSON.stringify(draft), "creative draft");
    return this.change((state) => {
      const old = state.creatives.find((c) => c.id === id);
      this.checkRevision(id, old?.revision, expectedRevision);
      const release = state.releases.find((r) => r.id === draft.releaseId);
      if (!release?.lessons[draft.lessonIndex])
        throw new UserError("Select a lesson from a local course release.");
      if (!old && state.creatives.length >= 100)
        throw new UserError("Local creative limit reached.");
      const next = {
        ...draft,
        id: id || randomUUID(),
        revision: expectedRevision + 1,
        updatedAt: stamp(),
      };
      state.creatives = [...state.creatives.filter((c) => c.id !== id), next];
      return next;
    });
  }
  approveCreative(id: string, raw: unknown) {
    const input = releaseRequest.parse(raw);
    return this.change((state) => {
      const creative = state.creatives.find((c) => c.id === id);
      if (!creative) throw new UserError("Creative not found.", 404);
      this.checkRevision(id, creative.revision, input.expectedRevision);
      if (!creative.rightsConfirmed || !creative.copy || !creative.brief)
        throw new UserError(
          "Add copy, a brief and confirm rights before approving.",
        );
      const { approval: _approval, ...content } = creative;
      creative.approval = {
        hash: hash(content),
        revision: creative.revision,
        approvedAt: stamp(),
      };
      return creative;
    });
  }
  saveCampaign(raw: unknown) {
    const { id, expectedRevision, ...draft } = campaignDraft
      .extend(edit)
      .parse(raw);
    assertClean(JSON.stringify(draft), "campaign draft");
    const url = new URL(draft.destination);
    if (url.protocol !== "https:" || url.username || url.password)
      throw new UserError(
        "Use an HTTPS destination without embedded credentials.",
      );
    url.searchParams.set("utm_source", draft.source);
    url.searchParams.set("utm_medium", draft.medium);
    url.searchParams.set("utm_campaign", slug(draft.title));
    url.searchParams.delete("utm_content");
    return this.change((state) => {
      const old = state.campaigns.find((c) => c.id === id);
      this.checkRevision(id, old?.revision, expectedRevision);
      const creative = state.creatives.find((c) => c.id === draft.creativeId);
      if (!creative?.approval)
        throw new UserError(
          "Approve the exact creative revision before preparing its campaign.",
        );
      if (!old && state.campaigns.length >= 100)
        throw new UserError("Local campaign limit reached.");
      url.searchParams.set(
        "utm_content",
        `${creative.id}-v${creative.revision}`,
      );
      const next = {
        ...draft,
        id: id || randomUUID(),
        revision: expectedRevision + 1,
        updatedAt: stamp(),
        creativeHash: creative.approval.hash,
        creativeSnapshot: structuredClone(creative),
        trackedUrl: url.href,
        status: "draft" as const,
      };
      state.campaigns = [...state.campaigns.filter((c) => c.id !== id), next];
      return next;
    });
  }
}
export function expansionRoutes(
  app: Application,
  media: CreatorProduction,
  onWork?: (work: AgentWorkService) => void,
) {
  const router = Router(),
    expansion = new Expansion(app);
  const agents = new ProductAgents(app, () => expansion.state());
  const work = new AgentWorkService(app, expansion, media);
  onWork?.(work);
  router.use("/work", work.routes());
  router.get("/agents", (_req, res) => res.json(agents.list()));
  router.post("/agents/run", async (req, res) => {
    const input = z
      .object({
        domain: agentDomain,
        entityId: z.string().uuid(),
        expectedRevision: z.number().int(),
        approveProvider: z.literal(true),
      })
      .strict()
      .parse(req.body);
    res.json(
      await agents.run(input.domain, input.entityId, input.expectedRevision),
    );
  });
  router.get("/state", (_req, res) => res.json(expansion.state()));
  const handoffs = new AgentHandoffs(app);
  router.get("/handoffs", (_req, res) => res.json(handoffs.list()));
  router.post("/handoffs/offer", (req, res) => {
    const input = z
      .object({ runId: z.string().uuid(), to: agentDomain })
      .strict()
      .parse(req.body);
    res.json(handoffs.offer(input.runId, input.to));
  });
  router.post("/handoffs/:id/accept", (req, res) => {
    const input = z
      .object({ hash: z.string().length(64), approve: z.literal(true) })
      .strict()
      .parse(req.body);
    res.json(handoffs.accept(req.params.id, input.hash));
  });
  router.get("/hosted/mine", async (_req, res) =>
    res.json(await app.ai.platform("mine")),
  );
  router.post("/hosted/:id/withdraw", async (req, res) => {
    z.object({ approveWithdrawal: z.literal(true) })
      .strict()
      .parse(req.body);
    const id = z.string().uuid().parse(req.params.id);
    res.json(await app.ai.platform(`courses/${id}/withdraw`, req.body));
  });
  router.post("/hosted/redeem", async (req, res) => {
    const input = z
      .object({ grant: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict()
      .parse(req.body);
    res.json(await app.serial(() => expansion.importHosted(input.grant)));
  });
  router.post("/releases/:id/publish", async (req, res) => {
    z.object({ approvePublicRelease: z.literal(true) })
      .strict()
      .parse(req.body);
    res.json(await expansion.publishHosted(req.params.id));
  });
  router.post("/courses/save", (req, res) =>
    res.json(expansion.saveCourse(req.body)),
  );
  router.post("/courses/:id/validate", (req, res) => {
    const course = expansion
      .state()
      .courses.find((c) => c.id === req.params.id);
    if (!course) throw new UserError("Course not found.", 404);
    res.json(validateCourse(course));
  });
  router.post("/courses/:id/release", (req, res) =>
    res.json(expansion.release(req.params.id, req.body)),
  );
  router.get("/courses/:id/project", (req, res) =>
    res.json(expansion.compiler.status(req.params.id) || null),
  );
  router.post("/courses/:id/compile", async (req, res) => {
    const input = z
      .object({
        expectedRevision: z.number().int(),
        approveExecution: z.literal(true),
      })
      .strict()
      .parse(req.body);
    const course = expansion
      .state()
      .courses.find((c) => c.id === req.params.id);
    if (!course || course.revision !== input.expectedRevision)
      throw new UserError(
        "Reload the current course draft before compiling.",
        409,
      );
    const report = validateCourse(course);
    if (!report.valid) throw new UserError(report.issues.join(" "));
    res.json(
      await expansion.compiler.compile(course.id, course.revision, course),
    );
  });
  router.post("/releases/:id/enroll", (req, res) => {
    z.object({}).strict().parse(req.body);
    res.json(expansion.enroll(req.params.id));
  });
  router.post("/releases/:id/launch", async (req, res) => {
    const input = z
      .object({ lessonIndex: z.number().int().min(0).max(29) })
      .strict()
      .parse(req.body);
    res.json(
      await app.serial(() =>
        expansion.launch(req.params.id, input.lessonIndex),
      ),
    );
  });
  router.post("/releases/:id/preview", async (req, res) => {
    const input = z
      .object({ lessonIndex: z.number().int().min(0).max(29) })
      .strict()
      .parse(req.body);
    res.json(
      await app.serial(() =>
        expansion.launch(req.params.id, input.lessonIndex, true),
      ),
    );
  });
  router.post("/creatives/save", (req, res) =>
    res.json(expansion.saveCreative(req.body)),
  );
  router.post("/creatives/:id/approve", (req, res) =>
    res.json(expansion.approveCreative(req.params.id, req.body)),
  );
  router.post("/creatives/:id/design", (req, res) => {
    const input = z
        .object({ format: z.enum(["square", "wide"]) })
        .strict()
        .parse(req.body),
      creative = expansion
        .state()
        .creatives.find((c) => c.id === req.params.id);
    if (!creative) throw new UserError("Save a creative draft first.");
    res.json(designExport(creative, input.format));
  });
  router.post("/campaigns/save", (req, res) =>
    res.json(expansion.saveCampaign(req.body)),
  );
  return router;
}
