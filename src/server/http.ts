import { projectKinds, pythonProfiles } from "../project-types.js";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { Application } from "./application.js";
import { observationSchema } from "../shared.js";
import { UserError } from "./safety.js";
import { run } from "./git.js";
import { githubStatus, signInGithub } from "./github.js";
import { Workspace } from "./workspace.js";
import { CourseLibrary } from "./library.js";
import { Practice } from "./practice.js";
import { ProjectRuntime } from "./project-runtime.js";
import { LiveWork } from "./live-work.js";
import { LearningPath, directionSchema } from "./learning-path.js";
import { IdeaNotebook } from "./notebook.js";
import { workspaceFeatures } from "./workspace-features.js";
import { EditorIntegration } from "./editor-integration.js";
import { expansionRoutes, Expansion } from "./expansion.js";
import { CreatorProduction } from "./creator-production.js";
import { SocialConnections, type SocialVault } from "./social-connections.js";
import { GTMPublishing } from "./gtm-publishing.js";
import { GTMAnalytics } from "./gtm-analytics.js";
import { LearnDelivery } from "./learn-delivery.js";
import { GTMStudio } from "./gtm-studio.js";
import { PublicationQueue } from "./publication-queue.js";
import type { AgentWorkService } from "./agent-work.js";
import { MediaTranscripts } from "./media-transcripts.js";
import { AcademyStudio } from "./academy-studio.js";
import packageMetadata from "../../package.json" with { type: "json" };

const text = z.string().max(2000);
const { version } = packageMetadata;
function matches(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function createApp(
  application: Application,
  port: number,
  focusDesktop?: () => void,
  editorVsix = process.env.OUTCLASS_EDITOR_VSIX ||
    path.resolve(`dist/editor/OutClass-Editor-${version}.vsix`),
  socialVault: SocialVault = {},
) {
  const app = express();
  let agentWork: AgentWorkService | undefined;
  const creatorProduction = new CreatorProduction(application, () =>
    new Expansion(application).state(),
  );
  const social = new SocialConnections(port, fetch, socialVault),
    publishing = new GTMPublishing(
      application,
      () => new Expansion(application).state(),
      social,
      creatorProduction,
    );
  const workspace = new Workspace(application);
  const publicationQueue = new PublicationQueue(
    application,
    publishing,
    social,
  );
  publicationQueue.start();
  const practice = new Practice(application, workspace);
  const runtime = new ProjectRuntime(application, workspace);
  const live = new LiveWork(application, workspace, runtime, practice);
  const learning = new LearningPath(
    application,
    workspace,
    practice,
    runtime,
    live,
  );
  app.locals.stopPrograms = async () => {
    app.locals.closing = true;
    creatorProduction.stop();
    agentWork?.stop();
    publicationQueue.stop();
    live.stopAll();
    runtime.stopAll();
    await workspace.stopAll();
  };
  const library = new CourseLibrary(application);
  const notebook = new IdeaNotebook(application);
  const editorIntegration = new EditorIntegration(editorVsix);
  app.disable("x-powered-by");
  const localOrigins = new Set([
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
  ]);
  const pairAttempts = new Map<string, { count: number; at: number }>();
  app.use((req, res, next) => {
    if (app.locals.closing) {
      res
        .status(503)
        .json({ error: "OutClass is closing. Reopen the app to continue." });
      return;
    }
    const host = req.headers.host;
    if (!host || ![`127.0.0.1:${port}`, `localhost:${port}`].includes(host)) {
      res.status(403).json({ error: "Invalid host." });
      return;
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    const origin = req.headers.origin;
    const extension = /^chrome-extension:\/\/[a-p]{32}$/.test(origin || "");
    if (origin && !localOrigins.has(origin) && !extension) {
      res
        .status(403)
        .json({ error: "This page cannot access your learning companion." });
      return;
    }
    if (origin && (localOrigins.has(origin) || extension)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type",
      );
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.use(express.json({ limit: "1mb" }));
  app.use("/creator-media", creatorProduction.publicRoutes());
  app.use("/social-image", publishing.images.publicRoutes());
  app.use("/social/callback", social.callbacks());
  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, name: "GitLearn", version }),
  );
  app.get("/preview/:token", (req, res) => {
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Security-Policy",
      "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
    );
    res.type("html").send(workspace.previewDocument(req.params.token));
  });
  app.get("/api/bootstrap", (_req, res) =>
    res.status(403).json({ error: "Connect from the local OutClass page." }),
  );
  app.post("/api/bootstrap", (req, res) => {
    const origin = req.headers.origin;
    const site = req.headers["sec-fetch-site"];
    if (
      !origin ||
      !localOrigins.has(origin) ||
      (site && !["same-origin", "none"].includes(String(site)))
    ) {
      res
        .status(403)
        .json({ error: "Open the local OutClass page to connect." });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json({ token: application.store.get("localToken") });
  });
  app.post("/api/pair", (req, res) => {
    const origin = req.headers.origin || "";
    if (!/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) {
      res
        .status(403)
        .json({ error: "Pair from the OutClass Chrome extension." });
      return;
    }
    const now = Date.now();
    const attempts = pairAttempts.get(origin);
    if (attempts && now - attempts.at < 60000 && attempts.count >= 5) {
      res
        .status(429)
        .json({ error: "Wait one minute before trying another code." });
      return;
    }
    pairAttempts.set(origin, {
      count: attempts && now - attempts.at < 60000 ? attempts.count + 1 : 1,
      at: attempts?.at || now,
    });
    const input = z
      .object({ code: z.string().regex(/^\d{6}$/) })
      .parse(req.body);
    const pair = application.store.get<{ code: string; expires: number }>(
      "pairCode",
    );
    if (!pair || pair.expires < now || !matches(pair.code, input.code)) {
      res.status(401).json({
        error:
          "That connection code has expired or is incorrect. Get a new code in Setup.",
      });
      return;
    }
    const token = randomBytes(32).toString("hex");
    application.store.transaction(() => {
      application.store.put("extensionToken", { origin, token });
      application.store.remove("pairCode");
    });
    res.json({ token });
  });
  app.post("/api/editor-pair", (req, res) => {
    if (req.headers.origin && !localOrigins.has(req.headers.origin)) {
      res.status(403).json({ error: "Connect from your local code editor." });
      return;
    }
    const key = "editor",
      now = Date.now(),
      attempt = pairAttempts.get(key);
    if (attempt && now - attempt.at < 60000 && attempt.count >= 5) {
      res
        .status(429)
        .json({ error: "Wait one minute before trying another editor code." });
      return;
    }
    pairAttempts.set(key, {
      at: attempt && now - attempt.at < 60000 ? attempt.at : now,
      count: attempt && now - attempt.at < 60000 ? attempt.count + 1 : 1,
    });
    const code = z
        .string()
        .regex(/^\d{6}$/)
        .parse(req.body.code),
      pair = application.store.get<{
        code: string;
        expires: number;
        courseId: string;
      }>("editorPairCode");
    if (!pair || pair.expires < now || !matches(code, pair.code)) {
      res
        .status(401)
        .json({ error: "Generate a new editor connection code in OutClass." });
      return;
    }
    const connections =
      application.store.get<{ id: string; token: string; courseId: string }[]>(
        "editorConnections",
      ) || [];
    if (connections.length >= 12)
      throw new UserError("Disconnect an old editor before pairing another.");
    const token = randomBytes(32).toString("hex");
    connections.push({
      id: randomBytes(12).toString("hex"),
      token,
      courseId: pair.courseId,
    });
    application.store.put("editorConnections", connections);
    application.store.remove("editorPairCode");
    res.json({ token });
  });
  app.use("/api", (req, res, next) => {
    const bearer = req.headers.authorization?.replace(/^Bearer /, "") || "";
    const origin = req.headers.origin;
    const extension = application.store.get<{ origin: string; token: string }>(
      "extensionToken",
    );
    // Chrome omits Origin on extension-worker GETs. The paired bearer still
    // authenticates them; requests carrying an Origin must match the pairing.
    const isExtension =
      !!extension &&
      (!origin || origin === extension.origin) &&
      matches(bearer, extension.token);
    const isLocal =
      (!origin || localOrigins.has(origin)) &&
      matches(bearer, application.store.get<string>("localToken")!);
    const editor =
      !origin || localOrigins.has(origin)
        ? (
            application.store.get<
              { id: string; token: string; courseId: string }[]
            >("editorConnections") || []
          ).find((e) => matches(bearer, e.token))
        : undefined;
    if (!isLocal && !isExtension && !editor) {
      res.status(401).json({ error: "Reconnect to the local companion." });
      return;
    }
    if (editor) {
      if (
        ![
          "/editor-context",
          "/assistant-chat",
          "/library-index",
          "/editor-run",
        ].includes(req.path)
      ) {
        res
          .status(403)
          .json({ error: "Use OutClass for this workspace action." });
        return;
      }
      if (
        req.path !== "/editor-context" &&
        req.body?.courseId !== editor.courseId
      ) {
        res
          .status(403)
          .json({ error: "This editor is paired with a different course." });
        return;
      }
      res.locals.editorCourseId = editor.courseId;
      if (application.store.state().session?.courseId !== editor.courseId)
        throw new UserError(
          "Continue the paired course in OutClass before using this editor connection.",
          409,
        );
    }
    if (
      isExtension &&
      ![
        "/observations",
        "/extension-status",
        "/course-material",
        "/open-desktop",
      ].includes(req.path)
    ) {
      res.status(403).json({
        error: "Use the local app for workspace and repository actions.",
      });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.get("/api/state", async (_req, res) =>
    res.json(await application.status()),
  );
  workspaceFeatures(app, application, notebook);
  app.use(
    "/api/expansion",
    expansionRoutes(application, creatorProduction, (work) => {
      agentWork = work;
    }),
  );
  const delivery = new LearnDelivery(application);
  app.get("/api/learn-assignment", (req, res) =>
    res.json(
      delivery.snapshot(
        text.parse(req.query.courseId),
        text.parse(req.query.lessonId),
      ),
    ),
  );
  app.post("/api/learn-assignment", (req, res) => {
    const input = z
      .object({ courseId: text, lessonId: text, progress: z.unknown() })
      .strict()
      .parse(req.body);
    res.json(delivery.save(input.courseId, input.lessonId, input.progress));
  });
  app.post("/api/learn-assignment/hint", async (req, res) => {
    const input = z
      .object({ courseId: text, lessonId: text })
      .strict()
      .parse(req.body);
    await learning.assertFresh(input.courseId);
    res.json(delivery.hint(input.courseId, input.lessonId));
  });
  app.use(
    "/api/expansion/media/transcripts",
    new MediaTranscripts(application, creatorProduction).routes(),
  );
  app.use("/api/expansion/media", creatorProduction.routes());
  app.use(
    "/api/academy",
    new AcademyStudio(application, new Expansion(application)).routes(),
  );
  app.use(
    "/api/expansion/promotions",
    new GTMStudio(application, creatorProduction).routes(),
  );
  app.use("/api/expansion/social", social.routes());
  app.use("/api/expansion/publishing", publishing.routes());
  app.use("/api/expansion/social-images", publishing.images.routes());
  app.use("/api/expansion/queue", publicationQueue.routes());
  app.use(
    "/api/expansion/analytics",
    new GTMAnalytics(application, () =>
      new Expansion(application).state(),
    ).routes(),
  );
  app.post("/api/editor-run", async (req, res) => {
    const input = z
        .object({
          courseId: z.string().min(1).max(200),
          path: z.string().min(1).max(300),
        })
        .parse(req.body),
      session = application.configured().session;
    if (!session || session.courseId !== input.courseId)
      throw new UserError(
        "Select the active course before running its saved file.",
        409,
      );
    res.json(await workspace.run(session.id, input.path));
  });
  app.get("/api/editor-context", (req, res) => {
    const state = application.store.state(),
      session = state.session;
    if (
      !session ||
      (res.locals.editorCourseId &&
        session.courseId !== res.locals.editorCourseId)
    )
      throw new UserError(
        "Continue this editor's paired course in OutClass before asking for help.",
        409,
      );
    const course = state.courses.find((c) => c.id === session.courseId)!;
    res.json({
      course: { id: course.id, title: course.title },
      session: {
        id: session.id,
        workspace: session.workspace,
        lessonTitle: session.lessonTitle,
      },
      aiReady: application.ai.ready(),
    });
  });
  app.get("/api/editors", async (_req, res) =>
    res.json({
      ...(await editorIntegration.status()),
      connections: (
        application.store.get<
          { id: string; token: string; courseId: string }[]
        >("editorConnections") || []
      ).map(({ id, courseId }) => ({ id, courseId })),
    }),
  );
  app.post("/api/editor-code", (_req, res) => {
    const session = application.configured().session;
    if (!session)
      throw new UserError(
        "Start or continue a course before connecting its editor.",
      );
    const code = randomInt(100000, 1000000).toString();
    application.store.put("editorPairCode", {
      code,
      expires: Date.now() + 300000,
      courseId: session.courseId,
    });
    res.json({ code });
  });
  app.post("/api/editor-revoke", (req, res) => {
    const id = z
      .string()
      .regex(/^[a-f0-9]{24}$/)
      .parse(req.body.id);
    application.store.put(
      "editorConnections",
      (
        application.store.get<
          { id: string; token: string; courseId: string }[]
        >("editorConnections") || []
      ).filter((c) => c.id !== id),
    );
    res.json({ ok: true });
  });
  app.post("/api/editor-install", async (req, res) =>
    res.json(
      await editorIntegration.install(
        z.enum(["vscode", "codium"]).parse(req.body.id),
      ),
    ),
  );
  app.post("/api/editor-extensions", async (req, res) =>
    res.json(
      await editorIntegration.extensions(
        z.enum(["vscode", "codium"]).parse(req.body.id),
      ),
    ),
  );
  app.post("/api/editor-open", async (req, res) => {
    const id = z.enum(["vscode", "codium"]).parse(req.body.id),
      session = application.configured().session;
    if (!session) throw new UserError("Start a course first.");
    await workspace.list(session.id);
    res.json(await editorIntegration.open(id, session.workspace));
  });
  app.post("/api/open-desktop", (_req, res) => {
    focusDesktop?.();
    res.json({ opened: !!focusDesktop });
  });
  const fileQuery = z.object({ sessionId: text.min(1), path: text.min(1) });
  app.get("/api/learning-path", (req, res) =>
    res.json(learning.status(text.min(1).parse(req.query.courseId))),
  );
  app.get("/api/learning-impact", async (req, res) =>
    res.json(await learning.impact(text.min(1).parse(req.query.courseId))),
  );
  app.post("/api/learning-direction", (req, res) => {
    const input = directionSchema
      .extend({ courseId: text.min(1) })
      .parse(req.body);
    res.json(learning.saveDirection(input.courseId, input));
  });
  app.post("/api/learning-milestone", (req, res) => {
    const input = z
      .object({
        courseId: text.min(1),
        milestoneId: text.min(1),
        reference: z.string().uuid(),
        reflection: z.string().max(4000),
      })
      .parse(req.body);
    res.json(
      learning.complete(
        input.courseId,
        input.milestoneId,
        input.reference,
        input.reflection,
      ),
    );
  });
  app.post("/api/learning-project-brief", async (req, res) =>
    res.json(
      await application.serial(() =>
        learning.writeBrief(text.min(1).parse(req.body.courseId)),
      ),
    ),
  );
  app.get("/api/learning-ledger", async (req, res) =>
    res.json(
      await learning.ledger(
        text.min(1).parse(req.query.courseId),
        z.enum(["markdown", "html"]).parse(req.query.format),
      ),
    ),
  );
  app.get("/api/practice", (req, res) =>
    res.json(
      practice.dashboard(
        req.query.courseId ? text.parse(req.query.courseId) : undefined,
      ),
    ),
  );
  app.get("/api/learning-search", (req, res) =>
    res.json({ results: practice.search(text.parse(req.query.q)) }),
  );
  app.post("/api/practice-start", async (req, res) => {
    const input = z
      .object({
        courseId: text.min(1),
        exerciseId: text.min(1),
        reviewOf: z.string().uuid().optional(),
        transferOf: z.string().uuid().optional(),
      })
      .parse(req.body);
    res.json(
      await application.serial(() =>
        practice.start(
          input.courseId,
          input.exerciseId,
          input.reviewOf,
          input.transferOf,
        ),
      ),
    );
  });
  app.post("/api/practice-check", async (req, res) => {
    const input = z
      .object({ taskId: z.string().uuid(), sessionId: z.string().uuid() })
      .parse(req.body);
    res.json(await practice.check(input.taskId, input.sessionId));
  });
  app.post("/api/practice-hint", async (req, res) =>
    res.json(await practice.hint(z.string().uuid().parse(req.body.taskId))),
  );
  app.post("/api/practice-update", (req, res) => {
    const input = z
      .object({
        taskId: z.string().uuid(),
        action: z.enum(["pause", "resume", "reflection"]),
        reflection: z.string().max(4000).default(""),
      })
      .parse(req.body);
    res.json(practice.update(input.taskId, input.action, input.reflection));
  });
  app.post("/api/practice-defer", (req, res) => {
    const input = z
      .object({ key: text, days: z.number().int().min(1).max(365) })
      .parse(req.body);
    practice.defer(input.key, input.days);
    res.json({ ok: true });
  });
  app.post("/api/practice-reviews", (req, res) => {
    application.store.put(
      "practice:reviewsEnabled",
      z.boolean().parse(req.body.enabled),
    );
    res.json({ ok: true });
  });
  app.get("/api/learning-export", (_req, res) =>
    res.json({
      version: 1,
      exportedAt: new Date().toISOString(),
      practice: practice.dashboard(),
      contributions: live.records(),
    }),
  );
  app.get("/api/project-commands", (req, res) =>
    res.json({
      commands: runtime.status(text.min(1).parse(req.query.sessionId)),
    }),
  );
  app.post("/api/project-command", async (req, res) => {
    const input = z
      .object({ sessionId: z.string().uuid(), command: text.min(1) })
      .parse(req.body);
    res.json(await runtime.start(input.sessionId, input.command));
  });
  app.post("/api/project-scaffold", async (req, res) => {
    const input = z
      .object({
        sessionId: z.string().uuid(),
        kind: z.enum(projectKinds),
        profile: z.enum(pythonProfiles).optional(),
      })
      .parse(req.body);
    res.json(
      await application.serial(() =>
        runtime.scaffold(input.sessionId, input.kind, input.profile),
      ),
    );
  });
  app.post("/api/project-input", (req, res) => {
    const input = z
      .object({ id: z.string().uuid(), text: z.string().max(4000) })
      .parse(req.body);
    runtime.input(input.id, input.text);
    res.json({ ok: true });
  });
  app.post("/api/project-stop", (req, res) => {
    runtime.stop(z.string().uuid().parse(req.body.id));
    res.json({ ok: true });
  });
  app.get("/api/live-work", (_req, res) => res.json(live.status()));
  app.post("/api/live-search", async (req, res) =>
    res.json(
      await live.discover(
        z
          .enum(["JavaScript", "Python", "TypeScript", "C", "C++"])
          .parse(req.body.language),
        req.body.courseId ? text.parse(req.body.courseId) : undefined,
      ),
    ),
  );
  app.post("/api/live-select", async (req, res) => {
    const input = z
      .object({ courseId: text.min(1), url: text.min(1) })
      .parse(req.body);
    res.json(await live.select(input.courseId, input.url));
  });
  app.post("/api/live-clone", async (req, res) =>
    res.json(
      await application.serial(() =>
        live.clone(z.string().uuid().parse(req.body.id)),
      ),
    ),
  );
  app.post("/api/live-open", async (req, res) =>
    res.json(
      await application.serial(() =>
        live.open(z.string().uuid().parse(req.body.id)),
      ),
    ),
  );
  app.post("/api/live-update", (req, res) => {
    const input = z
      .object({
        id: z.string().uuid(),
        notes: z.string().max(8000),
        stages: z.array(z.string().max(30)).max(6),
      })
      .parse(req.body);
    res.json(live.update(input.id, input.notes, input.stages));
  });
  app.post("/api/live-draft", async (req, res) =>
    res.json(await live.draft(z.string().uuid().parse(req.body.id))),
  );
  app.post("/api/live-refresh", async (req, res) =>
    res.json(await live.refresh(z.string().uuid().parse(req.body.id))),
  );
  app.get("/api/workspace-files", async (req, res) =>
    res.json(await workspace.list(text.min(1).parse(req.query.sessionId))),
  );
  app.get("/api/diagnostics", async (_req, res) =>
    res.json(await workspace.diagnostics()),
  );
  app.get("/api/workspace-runs", async (req, res) =>
    res.json({
      runs: await workspace.runs(text.min(1).parse(req.query.sessionId)),
    }),
  );
  app.post("/api/editor-anchor", async (req, res) => {
    const input = fileQuery
      .extend({ cursor: z.number().int().min(0).max(512000) })
      .parse(req.body);
    res.json(
      await application.serial(() =>
        workspace.editorAnchor(input.sessionId, input.path, input.cursor),
      ),
    );
  });
  app.post("/api/course-project", async (req, res) => {
    const input = z
      .object({
        courseId: text.min(1),
        mode: z.enum(["lesson", "project"]),
        root: text.min(1).optional(),
      })
      .parse(req.body);
    res.json(
      await application.serial(() =>
        application.bindProject(input.courseId, input.mode, input.root),
      ),
    );
  });
  app.post("/api/continue", async (req, res) => {
    const input = z
      .object({ courseId: text.min(1), workspace: text.min(1).optional() })
      .parse(req.body);
    res.json(
      await application.serial(() => {
        const session = application.store.state().session;
        if (input.workspace && session && workspace.isRunning(session.id))
          throw new UserError(
            "Stop the running program before choosing another folder.",
            409,
          );
        return application.continueCourse(input.courseId, input.workspace);
      }),
    );
  });
  app.get("/api/workspace-file", async (req, res) => {
    const input = fileQuery.parse(req.query);
    res.json(await workspace.read(input.sessionId, input.path));
  });
  app.post("/api/workspace-file", async (req, res) => {
    const input = fileQuery
      .extend({
        content: z.string().max(512000),
        version: z.string().length(64).nullable(),
      })
      .parse(req.body);
    res.json(
      await application.serial(() =>
        workspace.save(
          input.sessionId,
          input.path,
          input.content,
          input.version,
        ),
      ),
    );
  });
  app.post("/api/workspace-run", async (req, res) => {
    const input = fileQuery.parse(req.body);
    res.json(await workspace.run(input.sessionId, input.path));
  });
  app.get("/api/workspace-run-status", (req, res) =>
    res.json(workspace.runStatus(text.min(1).parse(req.query.sessionId))),
  );
  app.post("/api/workspace-input", (req, res) => {
    const input = z
      .object({ sessionId: z.string().uuid(), text: z.string().max(4000) })
      .parse(req.body);
    workspace.input(input.sessionId, input.text);
    res.json({ ok: true });
  });
  app.post("/api/workspace-preview", async (req, res) => {
    const input = fileQuery.parse(req.body);
    res.json(await workspace.preview(input.sessionId, input.path));
  });
  app.post("/api/workspace-stop", (req, res) => {
    workspace.stop(text.min(1).parse(req.body.sessionId));
    res.json({ ok: true });
  });
  app.get("/api/library", (req, res) =>
    res.json(library.status(text.min(1).parse(req.query.courseId))),
  );
  app.post("/api/library-index", async (req, res) => {
    const input = z
      .object({ courseId: text.min(1), semantic: z.boolean().default(true) })
      .parse(req.body);
    res.json(await library.index(input.courseId, input.semantic));
  });
  app.post("/api/library-remove", (req, res) => {
    const input = z
      .object({ courseId: text.min(1), documentId: text.min(1) })
      .parse(req.body);
    library.remove(input.courseId, input.documentId);
    res.json(library.status(input.courseId));
  });
  app.post("/api/course-material", async (req, res) => {
    const input = z
      .object({
        courseId: text.min(1),
        title: z.string().min(1).max(200),
        content: z.string().min(1).max(240000),
        kind: z.enum(["material", "transcript"]).default("material"),
        lessonId: text.default(""),
        observation: observationSchema.optional(),
      })
      .parse(req.body);
    if (input.observation) {
      if (input.observation.courseId !== input.courseId)
        throw new UserError("The transcript must match the selected course.");
      await application.serial(async () =>
        application.observe(input.observation!),
      );
    }
    const documentId = library.document(
      input.courseId,
      input.title,
      input.content,
      input.kind,
      input.lessonId,
    );
    res.json({ documentId, ...library.status(input.courseId) });
  });
  app.post("/api/assistant-enable", async (req, res) => {
    const input = z.object({ enabled: z.boolean() }).parse(req.body);
    if (input.enabled && !application.ai.ready())
      throw new UserError(
        "Choose included AI, a personal key, or a local model in Settings first.",
      );
    res.json(
      await application.serial(async () => {
        // AI preferences can be set before the learner chooses a history folder.
        const state = application.store.state();
        state.settings.assistantEnabled = input.enabled;
        application.store.save(state);
        return state;
      }),
    );
  });
  app.post("/api/assistant-chat", async (req, res) => {
    const input = z
      .object({
        courseId: text.min(1),
        question: z.string().min(1).max(4000),
        mode: z.enum(["help", "course"]),
        runId: z.string().uuid().optional(),
        tutorStyle: z.enum(["hint", "explain"]).default("explain"),
        projectId: z.string().uuid().optional(),
        selectedCode: z
          .object({ path: z.string().max(300), content: z.string().max(16000) })
          .optional(),
      })
      .parse(req.body);
    if (
      input.selectedCode &&
      application.store.state().session?.courseId !== input.courseId
    )
      throw new UserError(
        "Select the active course before attaching your current code.",
      );
    const session = application.store.state().session;
    if (
      input.runId &&
      (input.mode !== "help" || session?.courseId !== input.courseId)
    )
      throw new UserError(
        "Use Code help in the active course to explain a run.",
      );
    const runContext =
      input.mode === "help" && session?.courseId === input.courseId
        ? await learning.assertFresh(input.courseId, input.runId)
        : undefined;
    const teaching =
      input.mode === "help"
        ? {
            practice: practice.context(
              input.courseId,
              input.selectedCode?.path,
            ),
            projectCommand: runtime.context(input.courseId),
            contribution: live.context(input.courseId),
            direction: learning.direction(input.courseId),
            project: learning.status(input.courseId).milestones,
            architect: input.projectId
              ? notebook.context(input.projectId, input.courseId)
              : undefined,
          }
        : undefined;
    const answer = await library.ask(
      input.courseId,
      input.question,
      input.mode,
      input.selectedCode,
      runContext,
      input.tutorStyle,
      teaching,
    );
    if (teaching?.practice && answer.mode !== "retrieval")
      practice.recordHelp(teaching.practice.taskId);
    if (input.mode === "help" && answer.mode !== "retrieval")
      await learning.rememberHelp(input.courseId);
    res.json(answer);
  });
  app.post("/api/assistant-clear", (req, res) => {
    const id = text.min(1).parse(req.body.courseId);
    library.course(id);
    application.store.remove(`chat:${id}`);
    res.json({ messages: [] });
  });
  app.get("/api/extension-status", (_req, res) => {
    const state = application.store.state();
    res.json({
      configured: state.settings.configured,
      session: state.session
        ? {
            courseTitle: state.session.courseTitle,
            lessonTitle: state.session.lessonTitle,
            status: state.session.status,
          }
        : null,
    });
  });
  app.post("/api/observations", async (req, res) => {
    await application.serial(async () =>
      application.observe(observationSchema.parse(req.body)),
    );
    res.json({ received: true });
  });
  app.post("/api/setup", async (req, res) => {
    const input = z
      .object({ repoPath: text.min(1), aiEnabled: z.boolean() })
      .parse(req.body);
    res.json(
      await application.serial(() =>
        application.setup(input.repoPath, input.aiEnabled),
      ),
    );
  });
  app.post("/api/settings", async (req, res) => {
    const input = z.object({ aiEnabled: z.boolean() }).parse(req.body);
    res.json(
      await application.serial(async () => {
        const state = application.configured();
        state.settings.aiEnabled = input.aiEnabled;
        application.store.save(state);
        return state;
      }),
    );
  });
  app.post("/api/mirror", async (req, res) => {
    const input = z.object({ courseId: text }).parse(req.body);
    res.json(
      await application.serial(() => application.mirror(input.courseId)),
    );
  });
  app.post("/api/start", async (req, res) => {
    const input = z
      .object({ courseId: text, lessonId: text, workspace: text.optional() })
      .parse(req.body);
    res.json(
      await application.serial(() =>
        application.start(input.courseId, input.lessonId, input.workspace),
      ),
    );
  });
  app.post("/api/note", async (req, res) => {
    const input = z
      .object({ note: z.string().max(12000), sessionId: text.optional() })
      .parse(req.body);
    res.json(
      await application.serial(() => {
        if (
          input.sessionId &&
          application.store.state().session?.id !== input.sessionId
        )
          throw new UserError(
            "Your session has changed. Reopen the current workspace.",
            409,
          );
        return application.saveNote(input.note);
      }),
    );
  });
  app.post("/api/session", async (req, res) => {
    const input = z
      .object({ action: z.enum(["pause", "resume", "discard"]) })
      .parse(req.body);
    res.json(
      await application.serial(() => application.sessionAction(input.action)),
    );
  });
  app.post("/api/preview", async (_req, res) =>
    res.json(await application.serial(() => application.preview())),
  );
  app.post("/api/commit", async (req, res) => {
    const input = z
      .object({ previewId: text, message: text.min(1) })
      .parse(req.body);
    res.json(
      await application.serial(() =>
        application.commit(input.previewId, input.message),
      ),
    );
  });
  app.post("/api/remote", async (req, res) => {
    const input = z.object({ url: text }).parse(req.body);
    res.json(await application.serial(() => application.remote(input.url)));
  });
  app.post("/api/create-repository", async (req, res) => {
    const input = z
      .object({ name: z.string().min(1).max(100) })
      .parse(req.body);
    res.json(
      await application.serial(() => application.createRemote(input.name)),
    );
  });
  app.post("/api/github-login", async (_req, res) => {
    await signInGithub();
    res.json({ ok: true });
  });
  app.get("/api/github-status", async (_req, res) =>
    res.json(await githubStatus()),
  );
  app.post("/api/sync", async (_req, res) =>
    res.json(await application.serial(() => application.sync())),
  );
  app.post("/api/pair-code", (_req, res) => {
    const code = randomInt(100000, 1000000).toString();
    application.store.put("pairCode", {
      code,
      expires: Date.now() + 5 * 60000,
    });
    res.json({ code });
  });
  app.post("/api/unpair", (_req, res) => {
    application.store.remove("extensionToken");
    res.json({ ok: true });
  });
  app.post("/api/open-workspace", async (_req, res) => {
    const state = application.configured();
    if (!state.session) throw new UserError("Start a lesson session first.");
    // VS Code's Windows command wrapper requires cmd; arguments are restricted to a canonical saved grant.
    const folder = state.session.workspace;
    if (/["\r\n&|<>^%!]/.test(folder))
      throw new UserError(
        "Open this folder manually in VS Code; its path contains special shell characters.",
      );
    if (process.platform === "win32") {
      const { access } = await import("node:fs/promises");
      const cli = path.join(
        process.env.LOCALAPPDATA || "",
        "Programs",
        "Microsoft VS Code",
        "bin",
        "code.cmd",
      );
      await access(cli).catch(() => {
        throw new UserError(
          "VS Code was not found. Open your coding folder in your editor manually.",
        );
      });
      await run("cmd.exe", [
        "/d",
        "/s",
        "/c",
        `""${cli}" --new-window "${folder}""`,
      ]);
    } else await run("code", ["--new-window", folder]);
    res.json({ ok: true });
  });
  app.post("/api/browse", async (_req, res) => {
    if (process.platform !== "win32")
      throw new UserError("Paste your folder path into the field.");
    const result = await run("powershell.exe", [
      "-NoProfile",
      "-STA",
      "-Command",
      'Add-Type -AssemblyName System.Windows.Forms; $picker = New-Object System.Windows.Forms.FolderBrowserDialog; $picker.Description = "Choose your OutClass folder"; if ($picker.ShowDialog() -eq "OK") { $picker.SelectedPath }',
    ]);
    res.json({ path: result });
  });
  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof UserError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error:
            "Some details are missing or too long. Check your inputs and try again.",
        });
        return;
      }
      res.status(500).json({
        error:
          "Something went wrong. Your local work is safe. Try again or restart the companion.",
      });
    },
  );
  return app;
}
