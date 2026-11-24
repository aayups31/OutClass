import {
  mkdir,
  readFile,
  writeFile,
  realpath,
  readdir,
  lstat,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  AppState,
  Course,
  FrozenFile,
  Lesson,
  Observation,
  Preview,
  Session,
  Status,
  Checkpoint,
  ResumeAnchor,
  ContinueItem,
} from "../shared.js";
import { Store } from "./store.js";
import {
  assertClean,
  child,
  collect,
  fingerprint,
  inside,
  sanitizeUdemyUrl,
  shortId,
  slug,
  UserError,
} from "./safety.js";
import * as git from "./git.js";
import { prepareGithub } from "./github.js";
import { describe } from "./ai.js";
import { AIProvider } from "./ai-provider.js";
import { LearnDelivery } from "./learn-delivery.js";

export class Application {
  readonly ai = new AIProvider(this);
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    readonly store: Store,
    public apiKey?: string,
  ) {}
  serial<T>(action: () => Promise<T>): Promise<T> {
    const result = this.queue.then(action);
    this.queue = result.catch(() => {});
    return result;
  }
  async status(): Promise<Status> {
    const state = this.store.state();
    const [gitAvailable, ghAvailable] = await Promise.all([
      git.available("git"),
      git.available("gh"),
    ]);
    let sourceFiles = 0;
    if (state.session) {
      try {
        sourceFiles = (await collect(state.session.workspace)).files.length;
      } catch {
        /* Preview reports actionable errors. */
      }
    }
    const continueItems: ContinueItem[] = await Promise.all(
      state.courses.flatMap((course) => {
        const anchor = this.store.get<ResumeAnchor>(`resume:${course.id}`);
        if (!anchor) return [];
        return [
          (async () => {
            const info = await lstat(anchor.workspace).catch(() => null);
            const canonical =
              info?.isDirectory() && !info.isSymbolicLink()
                ? await realpath(anchor.workspace).catch(() => "")
                : "";
            const folderAvailable =
              canonical.toLowerCase() === anchor.workspace.toLowerCase();
            const fileAvailable =
              folderAvailable &&
              (!anchor.file ||
                !!(
                  await lstat(child(anchor.workspace, anchor.file)).catch(
                    () => null,
                  )
                )?.isFile());
            return { ...anchor, folderAvailable, fileAvailable };
          })(),
        ];
      }),
    );
    continueItems.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return {
      ...state,
      account: this.ai.status().account,
      hasApiKey: !!this.apiKey,
      hasAI: this.ai.ready(),
      gitAvailable,
      ghAvailable,
      sourceFiles,
      extensionConnected: !!this.store.get("extensionToken"),
      continueItems,
    };
  }
  configured() {
    const state = this.store.state();
    if (!state.settings.configured)
      throw new UserError("Choose your learning folder in Setup first.");
    return state;
  }
  async cleanTarget(state: AppState) {
    const generatedPaths = new Set<string>();
    for (const course of state.courses) {
      const expected = this.store.get<string>(`manifest:${course.id}`);
      if (
        expected &&
        (await readFile(
          child(state.settings.repoPath, `${course.path}/course.json`),
          "utf8",
        ).catch(() => undefined)) === expected
      )
        generatedPaths.add(`${course.path}/course.json`);
    }
    await git.ensureCleanTarget(state.settings.repoPath, generatedPaths);
  }
  async setup(repoPath: string, aiEnabled: boolean) {
    const state = this.store.state();
    const root = path.resolve(repoPath);
    if (!path.isAbsolute(repoPath) || root === path.parse(root).root)
      throw new UserError("Choose a full path to an empty learning folder.");
    if (state.settings.configured && root !== state.settings.repoPath)
      throw new UserError(
        "Your learning folder is already set. Export your history before changing it.",
      );
    if (!state.settings.configured) await git.initialize(root);
    state.settings = {
      ...state.settings,
      configured: true,
      repoPath: await realpath(root),
      aiEnabled,
    };
    this.store.save(state);
    return state;
  }
  observe(observation: Observation) {
    if (this.store.seen(observation.eventId)) return this.store.state();
    const url = sanitizeUdemyUrl(observation.url);
    assertClean(JSON.stringify({ ...observation, url }), "course metadata");
    const state = this.store.state();
    let course = state.courses.find((item) => item.id === observation.courseId);
    if (!course) {
      course = {
        id: observation.courseId,
        title: observation.title,
        url,
        path: `udemy/${slug(observation.title)}-${shortId(observation.courseId)}`,
        lessons: [],
        mirrored: false,
        observedAt: new Date().toISOString(),
      };
      state.courses.push(course);
    }
    course.title = observation.title;
    course.url = url;
    course.observedAt = new Date().toISOString();
    course.videoSeconds = observation.videoSeconds;
    if (observation.currentLessonId)
      course.currentLessonId = observation.currentLessonId;
    for (const observed of observation.lessons) {
      const existing = course.lessons.find((item) => item.id === observed.id);
      if (existing)
        Object.assign(existing, { ...observed, path: existing.path });
      else
        course.lessons.push({
          ...observed,
          path: `${slug(observed.section)}-${shortId(observed.sectionId || observed.section)}/${slug(observed.title)}-${shortId(observed.id)}`,
        });
    }
    this.store.transaction(() => {
      this.store.save(state);
      this.store.record(observation.eventId);
    });
    return state;
  }
  workspace(state: AppState, course: Course, lesson: Lesson) {
    return path.join(
      path.dirname(state.settings.repoPath),
      "workspaces",
      course.path,
      lesson.path,
    );
  }
  remember(session: Session, lastAction: ResumeAnchor["lastAction"]) {
    const previous = this.store.get<ResumeAnchor>(`resume:${session.courseId}`);
    const sameWorkspace = previous?.workspace === session.workspace;
    this.store.put(`resume:${session.courseId}`, {
      ...(sameWorkspace ? previous : {}),
      courseId: session.courseId,
      lessonId: session.lessonId,
      workspace: session.workspace,
      projectId: session.projectId,
      contributionId: session.contributionId,
      note: session.note,
      lastAction,
      updatedAt: new Date().toISOString(),
    } satisfies ResumeAnchor);
  }
  async codingFolder(root: string, create = false) {
    const history = this.configured().settings.repoPath;
    if (!path.isAbsolute(root))
      throw new UserError("Use a full path to your coding folder.");
    const workspace = path.resolve(root);
    if (
      inside(history, workspace) ||
      inside(workspace, history) ||
      workspace === path.parse(workspace).root
    )
      throw new UserError(
        "Choose a coding folder separate from your learning history repository.",
      );
    // Check ancestors before creation so a junction cannot redirect an automatic project.
    let parent = workspace;
    while (true) {
      const info = await lstat(parent).catch(() => null);
      if (
        info &&
        (info.isSymbolicLink() ||
          (await realpath(parent)).toLowerCase() !== parent.toLowerCase())
      )
        throw new UserError(
          "Choose the real folder path, not a shortcut or junction.",
        );
      if (parent === path.dirname(parent)) break;
      parent = path.dirname(parent);
    }
    if (create) await mkdir(workspace, { recursive: true });
    const info = await lstat(workspace).catch(() => null);
    if (!info?.isDirectory() || info.isSymbolicLink())
      throw new UserError(
        "Choose an existing coding folder without a junction or symlink.",
      );
    return realpath(workspace);
  }
  async bindProject(
    courseId: string,
    mode: "lesson" | "project",
    requestedRoot?: string,
  ) {
    const state = this.configured();
    if (state.session)
      throw new UserError(
        "Finish the current session before changing course folders.",
      );
    const course = state.courses.find((item) => item.id === courseId);
    if (!course) throw new UserError("Course not found.");
    if (mode === "project") {
      const root = await this.codingFolder(
        requestedRoot?.trim() ||
          course.project?.root ||
          path.join(
            path.dirname(state.settings.repoPath),
            "projects",
            course.path,
          ),
        !requestedRoot && !course.project,
      );
      if (
        state.courses.some(
          (item) =>
            item.id !== courseId &&
            item.project?.root.toLowerCase() === root.toLowerCase(),
        )
      )
        throw new UserError(
          "That project belongs to another course. Choose a separate folder.",
        );
      course.project = {
        id: course.project?.root === root ? course.project.id : randomUUID(),
        root,
      };
    }
    course.workspaceMode = mode;
    this.store.save(state);
    return state;
  }
  async continueCourse(courseId: string, requestedRoot?: string) {
    const state = this.configured();
    if (state.session && state.session.courseId !== courseId)
      throw new UserError(
        "Finish the current session before continuing another course.",
      );
    if (requestedRoot) {
      const anchor = this.store.get<ResumeAnchor>(`resume:${courseId}`);
      const course = state.courses.find((item) => item.id === courseId);
      if (!anchor || !course)
        throw new UserError("No saved workspace was found for this course.");
      const root = await this.codingFolder(requestedRoot);
      if (
        state.courses.some(
          (item) =>
            item.id !== courseId &&
            item.project?.root.toLowerCase() === root.toLowerCase(),
        )
      )
        throw new UserError(
          "That project belongs to another course. Choose a separate folder.",
        );
      if (course.project?.root === anchor.workspace) course.project.root = root;
      anchor.workspace = root;
      if (state.session) {
        state.session.workspace = root;
        state.session.id = randomUUID();
        state.session.status = "active";
      }
      this.store.transaction(() => {
        this.store.save(state);
        this.store.put(`resume:${courseId}`, anchor);
      });
    }
    if (state.session) {
      if (state.session.courseId !== courseId)
        throw new UserError(
          "Finish the current session before continuing another course.",
        );
      return this.sessionAction("resume");
    }
    const anchor = this.store.get<ResumeAnchor>(`resume:${courseId}`);
    if (!anchor)
      throw new UserError("Start a lesson to create a place to continue from.");
    await this.start(courseId, anchor.lessonId, anchor.workspace);
    const next = this.configured();
    next.session!.note = anchor.note;
    next.session!.contributionId = anchor.contributionId;
    this.store.save(next);
    this.remember(next.session!, "started");
    return next;
  }
  async mirror(courseId: string) {
    const state = this.configured();
    const course = state.courses.find((item) => item.id === courseId);
    if (!course) throw new UserError("Course not found.");
    await this.cleanTarget(state);
    const manifestPath = child(
      state.settings.repoPath,
      `${course.path}/course.json`,
    );
    const portable = {
      schemaVersion: 1,
      platform: course.platform || "udemy",
      courseId: course.id,
      title: course.title,
      url: course.url,
      discovery: course.platform === "academy" ? "versioned" : "partial",
      lessons: course.lessons.map((lesson) => ({ ...lesson })),
    };
    const generated = JSON.stringify(portable, null, 2) + "\n";
    const last = this.store.get<string>(`manifest:${course.id}`);
    const current = await readFile(manifestPath, "utf8").catch(() => undefined);
    if (current !== undefined && current !== last && current !== generated)
      throw new UserError(
        "Your course.json was edited outside OutClass. Keep your edits or resolve the difference before refreshing.",
      );
    await mkdir(path.dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, generated);
    const overviewPath = child(
      state.settings.repoPath,
      `${course.path}/COURSE.md`,
    );
    await writeFile(
      overviewPath,
      `# ${course.title}\n\nSource: ${course.url}\n\nThis workspace preserves my work. Curriculum discovery may be partial.\n`,
      { flag: "wx" },
    ).catch((error) => {
      if (error.code !== "EEXIST") throw error;
    });
    for (const lesson of course.lessons) {
      const workspace = this.workspace(state, course, lesson);
      await mkdir(workspace, { recursive: true });
      await writeFile(
        path.join(workspace, "notes.md"),
        `# ${lesson.title}\n\n## My notes\n\n`,
        { flag: "wx" },
      ).catch((error) => {
        if (error.code !== "EEXIST") throw error;
      });
      const placeholder = child(
        state.settings.repoPath,
        `${course.path}/${lesson.path}/README.md`,
      );
      await mkdir(path.dirname(placeholder), { recursive: true });
      await writeFile(
        placeholder,
        `# ${lesson.title}\n\nSection: ${lesson.section}\n\nLearner code and notes will be checkpointed here.\n`,
        { flag: "wx" },
      ).catch((error) => {
        if (error.code !== "EEXIST") throw error;
      });
    }
    course.mirrored = true;
    this.store.put(`manifest:${course.id}`, generated);
    this.store.save(state);
    // Scaffold files stay untracked until included in a meaningful learning checkpoint.
    return state;
  }
  async start(courseId: string, lessonId: string, requestedWorkspace?: string) {
    const state = this.configured();
    if (state.session)
      throw new UserError(
        "Finish or discard the current session before starting another.",
      );
    const course = state.courses.find((item) => item.id === courseId);
    const lesson = course?.lessons.find((item) => item.id === lessonId);
    if (!course || !lesson) throw new UserError("Select a lesson first.");
    const project =
      course.workspaceMode === "project" ? course.project : undefined;
    const workspace = await this.codingFolder(
      requestedWorkspace?.trim() ||
        project?.root ||
        this.workspace(state, course, lesson),
      !requestedWorkspace && !project,
    );
    const delivery =
      course.platform === "academy" ? new LearnDelivery(this) : undefined;
    state.session = {
      id: randomUUID(),
      courseId,
      lessonId,
      lessonTitle: lesson.title,
      courseTitle: course.title,
      section: lesson.section,
      workspace: await realpath(workspace),
      destination: `${course.path}/${lesson.path}`,
      startedAt: new Date().toISOString(),
      status: "active",
      note: delivery?.initialNote(courseId, lessonId) || "",
      projectId: project?.root === workspace ? project.id : undefined,
    };
    this.store.save(state);
    if (delivery) {
      try {
        await delivery.seed(courseId, lessonId);
      } catch (error) {
        state.session = null;
        this.store.save(state);
        throw error;
      }
    }
    this.remember(state.session, "started");
    return state;
  }
  async sessionAction(action: "pause" | "resume" | "discard", note?: string) {
    const state = this.configured();
    if (!state.session) throw new UserError("No learning session is running.");
    if (note !== undefined) {
      assertClean(note, "session note");
      state.session.note = note;
    }
    this.remember(
      state.session,
      action === "discard"
        ? "ended"
        : action === "pause"
          ? "paused"
          : "started",
    );
    if (action === "discard") state.session = null;
    else state.session.status = action === "pause" ? "paused" : "active";
    this.store.save(state);
    return state;
  }
  async saveNote(note: string) {
    const state = this.configured();
    if (!state.session)
      throw new UserError("Start a session before adding a note.");
    assertClean(note, "session note");
    state.session.note = note;
    this.store.save(state);
    this.remember(state.session, "saved");
    return state;
  }
  async candidate(state: AppState, session: Session) {
    const collected = await collect(session.workspace);
    const files = collected.files
      .filter(
        (file) =>
          !(
            file.path === "notes.md" &&
            Buffer.from(file.content!, "base64").toString("utf8") ===
              `# ${session.lessonTitle}\n\n## My notes\n\n`
          ),
      )
      .map((file) => ({
        ...file,
        path: `${session.destination}/${file.path}`,
      }));
    // An explicit note creates learner evidence even when no code changed.
    if (session.note.trim())
      files.push({
        path: `${session.destination}/session-notes/${session.id}.md`,
        content: Buffer.from(
          `# ${session.lessonTitle}\n\n${session.note.trim()}\n`,
        ).toString("base64"),
      });
    const root = state.settings.repoPath;
    const selected = new Set(files.map((file) => file.path));
    const previous = await git.tracked(root, session.destination);
    for (const filename of previous)
      if (
        !selected.has(filename) &&
        !filename.includes("/session-notes/") &&
        !filename.endsWith("/metadata.json") &&
        !filename.endsWith("/README.md")
      )
        files.push({ path: filename, content: null });
    const metadata = {
      schemaVersion: 1,
      platform: "udemy",
      courseId: session.courseId,
      lessonId: session.lessonId,
      lesson: session.lessonTitle,
      section: session.section,
      sessionId: session.id,
      startedAt: session.startedAt,
      checkpointedAt: new Date().toISOString(),
      evidence: "user-finished-session",
    };
    files.push({
      path: `${session.destination}/metadata.json`,
      content: Buffer.from(JSON.stringify(metadata, null, 2) + "\n").toString(
        "base64",
      ),
    });
    const scaffolding = ["README.md", ".gitignore"];
    const course = state.courses.find((item) => item.id === session.courseId)!;
    if (course.mirrored) {
      async function walk(relative: string) {
        for (const item of await readdir(child(root, relative), {
          withFileTypes: true,
        })) {
          const filename = `${relative}/${item.name}`;
          if (item.isDirectory()) await walk(filename);
          else if (
            !selected.has(filename) &&
            ["course.json", "COURSE.md", "README.md"].includes(item.name)
          )
            scaffolding.push(filename);
        }
      }
      await walk(course.path);
    }
    for (const filename of scaffolding) {
      const text = await readFile(child(root, filename));
      assertClean(text.toString("utf8"), filename);
      if (!files.some((file) => file.path === filename))
        files.push({ path: filename, content: text.toString("base64") });
    }
    return files.sort((a, b) => a.path.localeCompare(b.path));
  }
  async preview() {
    const state = this.configured();
    const session = state.session;
    if (!session)
      throw new UserError("Start a session before saving a checkpoint.");
    if (session.contributionId)
      throw new UserError(
        "For open source work, review your contribution diff and prepare a PR draft in Live work. The learning archive does not copy the upstream repository.",
      );
    await this.cleanTarget(state);
    const files = await this.candidate(state, session);
    const expectedHead = await git.head(state.settings.repoPath);
    const expectedBranch = await git.branch(state.settings.repoPath);
    const result = await git.tree(state.settings.repoPath, expectedHead, files);
    const substantive = result.changes.filter(
      (change) =>
        !change.path.endsWith("/metadata.json") &&
        change.path !== ".gitignore" &&
        change.path !== "README.md" &&
        !change.path.endsWith("/COURSE.md") &&
        !change.path.endsWith("/course.json") &&
        !change.path.endsWith("/README.md"),
    );
    if (!substantive.length && !session.note.trim())
      throw new UserError(
        "No new code or notes yet. Add what you learned, or keep learning before saving.",
      );
    const fallback = `course: checkpoint ${session.lessonTitle.slice(0, 85)}`;
    const ai = await describe(
      this.ai.config().mode === "personal" ? this.apiKey : undefined,
      state.settings.aiEnabled,
      {
        course: session.courseTitle,
        lesson: session.lessonTitle,
        note: session.note,
        diff: result.diff,
      },
      fallback,
      this.ai,
    );
    const preview: Preview = {
      id: randomUUID(),
      sessionId: session.id,
      expectedHead,
      expectedBranch,
      treeId: result.treeId,
      fingerprint: fingerprint(files),
      files,
      changes: result.changes,
      diff: result.diff.slice(0, 80000),
      ...ai,
      createdAt: new Date().toISOString(),
      reflection: session.note,
      video: (() => {
        const course = state.courses.find((c) => c.id === session.courseId);
        return course?.currentLessonId === session.lessonId &&
          course.videoSeconds !== undefined &&
          Date.now() - Date.parse(course.observedAt) < 15000
          ? {
              url: course.url,
              seconds: course.videoSeconds,
              capturedAt: course.observedAt,
            }
          : undefined;
      })(),
    };
    this.store.put(`preview:${preview.id}`, preview);
    return publicPreview(preview);
  }
  async commit(previewId: string, message: string) {
    const state = this.configured();
    const preview = this.store.preview(previewId);
    if (!preview || !state.session || preview.sessionId !== state.session.id)
      throw new UserError(
        "This preview has expired. Review a fresh checkpoint.",
      );
    if (Date.now() - Date.parse(preview.createdAt) > 3600000)
      throw new UserError(
        "This preview is over an hour old. Review a fresh checkpoint.",
      );
    assertClean(message, "commit message");
    if (!message.trim() || message.length > 2000)
      throw new UserError(
        "Use a commit message between 1 and 2,000 characters.",
      );
    // Current source edits stay in place. We save exactly the snapshot the user reviewed.
    await this.cleanTarget(state);
    if (
      (await git.head(state.settings.repoPath)) !== preview.expectedHead ||
      (await git.branch(state.settings.repoPath)) !== preview.expectedBranch
    )
      throw new UserError(
        "The repository changed after this preview. Review a fresh checkpoint.",
      );
    if (!/^[a-f0-9]{40,64}$/.test(preview.treeId))
      throw new UserError("Review a fresh checkpoint before saving.");
    if (fingerprint(preview.files) !== preview.fingerprint)
      throw new UserError(
        "Checkpoint integrity check failed. Create a fresh preview.",
      );
    const record: Checkpoint = {
      id: preview.id,
      sessionId: preview.sessionId,
      courseId: state.session.courseId,
      courseTitle: state.session.courseTitle,
      lessonTitle: state.session.lessonTitle,
      timestamp: new Date().toISOString(),
      message,
      sha: "",
      files: preview.changes.map((change) => change.path),
      sync: state.settings.remote ? "pending" : "local",
      lessonId: state.session.lessonId,
      video: preview.video,
      reflection: preview.reflection,
    };
    this.store.put("commitJournal", {
      record,
      files: preview.files,
      expectedHead: preview.expectedHead,
    });
    // The immutable Git tree already contains the exact reviewed bytes.
    record.sha = await git.commitTree(
      state.settings.repoPath,
      preview.expectedHead,
      preview.treeId,
      message,
      preview.id,
      preview.expectedBranch,
    );
    this.store.put("commitJournal", {
      record,
      files: preview.files,
      expectedHead: preview.expectedHead,
    });
    await git.reconcile(state.settings.repoPath, preview.files);
    state.checkpoints.unshift(record);
    this.remember(state.session!, "checkpoint");
    state.session = null;
    this.store.transaction(() => {
      this.store.save(state);
      this.store.remove(`preview:${preview.id}`);
      this.store.remove("commitJournal");
    });
    return record;
  }
  async recover() {
    const journal = this.store.get<{
      record: Checkpoint;
      files: FrozenFile[];
      expectedHead: string;
    }>("commitJournal");
    if (!journal) return;
    const state = this.configured();
    const sha = await git.findCheckpoint(
      state.settings.repoPath,
      journal.record.id,
    );
    if (!sha) {
      this.store.remove("commitJournal");
      return;
    }
    if ((await git.head(state.settings.repoPath)) !== sha)
      throw new UserError(
        "A saved checkpoint needs recovery, but Git history changed. Review the repository before continuing.",
      );
    await git.reconcile(state.settings.repoPath, journal.files);
    journal.record.sha = sha;
    if (!state.checkpoints.some((item) => item.id === journal.record.id))
      state.checkpoints.unshift(journal.record);
    if (state.session?.id === journal.record.sessionId) {
      this.remember(state.session, "checkpoint");
      state.session = null;
    }
    this.store.transaction(() => {
      this.store.save(state);
      this.store.remove("commitJournal");
      this.store.remove(`preview:${journal.record.id}`);
    });
  }
  async remote(url: string) {
    const state = this.configured();
    git.parseRemote(url);
    await prepareGithub();
    state.settings.remote = await git.connectRemote(
      state.settings.repoPath,
      url,
    );
    state.checkpoints.forEach((record) => (record.sync = "pending"));
    this.store.save(state);
    return state;
  }
  async createRemote(name: string) {
    const state = this.configured();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/.test(name))
      throw new UserError(
        "Use a repository name made of letters, numbers, hyphens, or underscores.",
      );
    if (state.settings.remote)
      throw new UserError("A repository is already connected.");
    const owner = await prepareGithub();
    if (!/^[a-zA-Z0-9-]+$/.test(owner))
      throw new UserError("Sign in to GitHub first.");
    await git.run("gh", [
      "repo",
      "create",
      name,
      "--private",
      "--description",
      "My code, notes, and learning checkpoints",
    ]);
    return this.remote(`https://github.com/${owner}/${name}`);
  }
  async sync() {
    const state = this.configured();
    if (!state.settings.remote)
      throw new UserError(
        "Connect a private GitHub repository in Setup first.",
      );
    if (!state.checkpoints.length)
      throw new UserError(
        "Save your first checkpoint before syncing to GitHub.",
      );
    await prepareGithub();
    await git.push(state.settings.repoPath, state.settings.remote);
    state.checkpoints.forEach((record) => (record.sync = "synced"));
    this.store.save(state);
    return state;
  }
}
export function publicPreview(preview: Preview) {
  const {
    files: _files,
    treeId: _treeId,
    expectedBranch: _branch,
    ...publicFields
  } = preview;
  return publicFields;
}
