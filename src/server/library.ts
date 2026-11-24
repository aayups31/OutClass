import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import OpenAI from "openai";
import { teacherAnswer, teacherInstructions } from "../ai-contract.js";
import {
  teacherGuidance,
  protectsLearnerWork,
  ensureDiagnosticQuestion,
  fallbackTeacherHint,
} from "../teacher-guidance.js";
import type { Application } from "./application.js";
import { assertClean, child, collect, UserError } from "./safety.js";
import { IdeaNotebook } from "./notebook.js";
import { LearnDelivery } from "./learn-delivery.js";
import { COURSE_LESSON_LIMIT } from "../course-limits.js";

export interface Evidence {
  id: string;
  title: string;
  text: string;
  kind: string;
  lessonId: string;
  startLine: number;
  endLine: number;
  number?: number;
}
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: Evidence[];
  mode?: string;
  at: string;
  contextId?: string;
  projectId?: string;
  recovery?: "ai-settings" | "retry";
}
type Chunk = {
  id: string;
  document_id: string;
  course_id: string;
  title: string;
  text: string;
  kind: string;
  lesson_id: string;
  start_line: number;
  end_line: number;
  embedding: string | null;
  model: string | null;
};
const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
const embeddingModel = "text-embedding-3-small";
export function chunks(text: string) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const result: { text: string; startLine: number; endLine: number }[] = [];
  // Split very long single lines as well as paragraphs; retain source line numbers.
  let content = "",
    startLine = 1,
    endLine = 1;
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].match(/.{1,1400}/g) || [""];
    for (const part of parts) {
      if (content.length + part.length > 1800 && content.trim()) {
        result.push({ text: content.trim(), startLine, endLine });
        content = "";
        startLine = i + 1;
      }
      if (!content) startLine = i + 1;
      content += part + "\n";
      endLine = i + 1;
    }
  }
  if (content.trim())
    result.push({ text: content.trim(), startLine, endLine: lines.length });
  return result;
}
export function cosine(a: number[], b: number[]) {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] ** 2;
    bb += b[i] ** 2;
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
export class CourseLibrary {
  private busy = new Set<string>();
  constructor(private app: Application) {
    app.store.db
      .exec(`CREATE TABLE IF NOT EXISTS rag_documents (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL, lesson_id TEXT NOT NULL, content TEXT NOT NULL, hash TEXT NOT NULL, generated INTEGER NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS rag_chunks (id TEXT PRIMARY KEY, document_id TEXT NOT NULL, course_id TEXT NOT NULL, title TEXT NOT NULL, text TEXT NOT NULL, kind TEXT NOT NULL, lesson_id TEXT NOT NULL, start_line INTEGER NOT NULL, end_line INTEGER NOT NULL, embedding TEXT, model TEXT);
      CREATE INDEX IF NOT EXISTS rag_course ON rag_chunks(course_id);
      CREATE VIRTUAL TABLE IF NOT EXISTS rag_fts USING fts5(id UNINDEXED, title, text, tokenize='porter unicode61');`);
  }
  course(id: string) {
    const course = this.app.configured().courses.find((item) => item.id === id);
    if (!course) throw new UserError("Select a course first.", 404);
    return course;
  }
  history(id: string) {
    this.course(id);
    return this.app.store.get<ChatMessage[]>(`chat:${id}`) || [];
  }
  status(id: string) {
    this.course(id);
    const sources = this.app.store.db
      .prepare(
        "SELECT id,title,kind,lesson_id AS lessonId,created_at AS createdAt FROM rag_documents WHERE course_id=? ORDER BY generated,created_at DESC",
      )
      .all(id);
    const counts = this.app.store.db
      .prepare(
        "SELECT COUNT(*) AS chunks, COALESCE(SUM(CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END),0) AS embedded FROM rag_chunks WHERE course_id=?",
      )
      .get(id) as { chunks: number; embedded: number };
    return {
      sources,
      ...counts,
      enabled: !!this.app.store.state().settings.assistantEnabled,
      hasAI: this.app.ai.ready(),
      hasApiKey: !!this.app.apiKey,
      model:
        process.env.OPENAI_CHAT_MODEL ||
        process.env.OPENAI_MODEL ||
        "gpt-4o-mini",
      messages: this.history(id),
    };
  }
  lessonMaterial(courseId: string, lessonId: string) {
    const course = this.course(courseId);
    if (!course.lessons.some((lesson) => lesson.id === lessonId))
      throw new UserError("That lesson does not belong to this course.", 404);
    return this.app.store.db.prepare(
      "SELECT title,content,kind FROM rag_documents WHERE course_id=? AND lesson_id=? AND generated=0 AND kind IN ('web-page','transcript') ORDER BY created_at DESC LIMIT 1",
    ).get(courseId, lessonId) as { title: string; content: string; kind: string } | undefined ?? null;
  }
  remove(id: string, documentId: string) {
    this.course(id);
    const doc = this.app.store.db
      .prepare("SELECT id FROM rag_documents WHERE id=? AND course_id=?")
      .get(documentId, id);
    if (!doc) throw new UserError("Source not found.", 404);
    this.app.store.transaction(() => {
      this.erase(documentId);
    });
  }
  private erase(documentId: string) {
    this.app.store.db
      .prepare(
        "DELETE FROM rag_fts WHERE id IN (SELECT id FROM rag_chunks WHERE document_id=?)",
      )
      .run(documentId);
    this.app.store.db
      .prepare("DELETE FROM rag_chunks WHERE document_id=?")
      .run(documentId);
    this.app.store.db
      .prepare("DELETE FROM rag_documents WHERE id=?")
      .run(documentId);
  }
  document(
    courseId: string,
    title: string,
    content: string,
    kind: string,
    lessonId = "",
    generatedId?: string,
    preserveSource = false,
  ) {
    const course = this.course(courseId);
    if (lessonId && !course.lessons.some((item) => item.id === lessonId))
      throw new UserError("That lesson does not belong to this course.");
    if (!content.trim() || content.length > 240000)
      throw new UserError("Add text up to 240,000 characters per source.");
    assertClean(title + "\n" + content, "course source");
    const id = generatedId || randomUUID(),
      hash = digest(title + content + lessonId);
    if (!generatedId) {
      const duplicate = this.app.store.db
        .prepare(
          "SELECT id FROM rag_documents WHERE course_id=? AND hash=? AND generated=0",
        )
        .get(courseId, hash) as { id: string } | undefined;
      if (duplicate) return duplicate.id;
    }
    const existing = this.app.store.db
      .prepare("SELECT hash FROM rag_documents WHERE id=? AND course_id=?")
      .get(id, courseId) as { hash: string } | undefined;
    if (existing?.hash === hash) {
      if (preserveSource)
        this.app.store.db
          .prepare(
            "UPDATE rag_documents SET generated=0 WHERE id=? AND course_id=?",
          )
          .run(id, courseId);
      return id;
    }
    const parts = chunks(content);
    const count = this.app.store.db
      .prepare(
        "SELECT COUNT(*) AS count FROM rag_chunks WHERE course_id=? AND document_id!=?",
      )
      .get(courseId, id) as { count: number };
    if (Number(count.count) + parts.length > 2000)
      throw new UserError(
        "This course has reached 2,000 searchable passages. Remove an unused source before adding more.",
      );
    const sourceLimit =
      kind === "academy" && preserveSource ? 120 + COURSE_LESSON_LIMIT : 120;
    if (
      !existing &&
      Number(
        (
          this.app.store.db
            .prepare(
              "SELECT COUNT(*) AS count FROM rag_documents WHERE course_id=?",
            )
            .get(courseId) as { count: number }
        ).count,
      ) >= sourceLimit
    )
      throw new UserError(
        `This course has reached its ${sourceLimit}-source limit. Remove an unused source before adding another.`,
      );
    this.app.store.transaction(() => {
      if (existing) this.erase(id);
      this.app.store.db
        .prepare("INSERT INTO rag_documents VALUES (?,?,?,?,?,?,?,?,?)")
        .run(
          id,
          courseId,
          title,
          kind,
          lessonId,
          content,
          hash,
          generatedId && !preserveSource ? 1 : 0,
          new Date().toISOString(),
        );
      for (const [i, part] of parts.entries()) {
        const chunkId = `${id}:${i}`;
        this.app.store.db
          .prepare(
            "INSERT INTO rag_chunks VALUES (?,?,?,?,?,?,?,?,?,NULL,NULL)",
          )
          .run(
            chunkId,
            id,
            courseId,
            title,
            part.text,
            kind,
            lessonId,
            part.startLine,
            part.endLine,
          );
        this.app.store.db
          .prepare("INSERT INTO rag_fts(id,title,text) VALUES (?,?,?)")
          .run(chunkId, title, part.text);
      }
    });
    return id;
  }
  async index(courseId: string, semantic = true) {
    const course = this.course(courseId),
      state = this.app.store.state();
    if (this.busy.has(courseId))
      throw new UserError(
        "This course is being indexed or answering a question. Try again shortly.",
        409,
      );
    this.busy.add(courseId);
    try {
      const generated = new Set<string>();
      const add = (
        title: string,
        text: string,
        kind: string,
        lessonId: string,
        identity: string,
      ) => {
        const id = `generated:${digest(courseId + identity)}`;
        generated.add(id);
        this.document(courseId, title, text, kind, lessonId, id);
      };
      add(
        "Course outline",
        `${course.title}\n${course.url}\n${course.lessons.map((item) => `${item.section}: ${item.title}`).join("\n")}`,
        "outline",
        "",
        "outline",
      );
      let indexedCharacters = 0;
      const addFiles = async (
        root: string,
        prefix: string,
        lessonId: string,
      ) => {
        for (const file of (await collect(root)).files) {
          if (indexedCharacters >= 200000 || generated.size >= 85) break;
          const text = Buffer.from(file.content!, "base64")
            .toString("utf8")
            .slice(0, Math.min(12000, 200000 - indexedCharacters));
          if (!text.trim()) continue;
          indexedCharacters += text.length;
          add(
            `${prefix} · ${file.path}`,
            text,
            /\.md$/i.test(file.path) ? "notes" : "code",
            lessonId,
            prefix + file.path,
          );
        }
      };
      if (state.session?.courseId === courseId) {
        await addFiles(
          state.session.workspace,
          "Working file",
          state.session.lessonId,
        );
        if (state.session.note.trim())
          add(
            "Current session notes",
            state.session.note,
            "notes",
            state.session.lessonId,
            "session-note",
          );
      }
      if (course.mirrored)
        await addFiles(
          child(state.settings.repoPath, course.path),
          "Checkpoint",
          "",
        );
      for (const row of this.app.store.db
        .prepare(
          "SELECT id FROM rag_documents WHERE course_id=? AND generated=1",
        )
        .all(courseId) as { id: string }[])
        if (!generated.has(row.id)) this.remove(courseId, row.id);
      let notice = "Local search is ready.";
      if (
        semantic &&
        state.settings.assistantEnabled &&
        this.app.apiKey &&
        this.app.ai.config().mode === "personal"
      ) {
        const pending = this.app.store.db
          .prepare(
            "SELECT id,text FROM rag_chunks WHERE course_id=? AND (embedding IS NULL OR model!=?) LIMIT 320",
          )
          .all(courseId, embeddingModel) as { id: string; text: string }[];
        try {
          const client = new OpenAI({
            apiKey: this.app.apiKey,
            timeout: 20000,
            maxRetries: 0,
          });
          for (let i = 0; i < pending.length; i += 48) {
            const batch = pending.slice(i, i + 48);
            const result = await client.embeddings.create({
              model: embeddingModel,
              dimensions: 384,
              input: batch.map((item) => item.text),
            });
            for (const vector of result.data)
              if (
                batch[vector.index] &&
                vector.embedding.every(Number.isFinite)
              )
                this.app.store.db
                  .prepare(
                    "UPDATE rag_chunks SET embedding=?,model=? WHERE id=?",
                  )
                  .run(
                    JSON.stringify(vector.embedding),
                    embeddingModel,
                    batch[vector.index].id,
                  );
          }
          notice =
            pending.length === 320
              ? "Indexed this batch for semantic search. Refresh again to index remaining passages."
              : "Semantic and keyword search are ready.";
        } catch {
          notice =
            "Local keyword search is ready. Semantic indexing is unavailable; try refreshing when OpenAI is reachable.";
        }
      }
      if (indexedCharacters >= 200000 || generated.size >= 85)
        notice +=
          " Automatic code context is limited to 85 sources / 200,000 characters; imported materials are indexed separately.";
      return { ...this.status(courseId), notice };
    } finally {
      this.busy.delete(courseId);
    }
  }
  async retrieve(
    courseId: string,
    query: string,
    lessonId = "",
    courseOnly = false,
  ): Promise<Evidence[]> {
    this.course(courseId);
    const all = this.app.store.db
      .prepare(
        `SELECT * FROM rag_chunks WHERE course_id=? ${courseOnly ? "AND kind IN ('material','transcript','web-page')" : ""} LIMIT 2000`,
      )
      .all(courseId) as unknown as Chunk[];
    const scores = new Map<string, number>();
    const stop = new Set([
      "the",
      "a",
      "an",
      "is",
      "are",
      "what",
      "how",
      "why",
      "can",
      "do",
      "does",
      "i",
      "my",
      "me",
      "to",
      "in",
      "of",
      "and",
      "for",
      "this",
      "it",
      "please",
      "explain",
      "help",
    ]);
    const words = [
      ...new Set(query.toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) || []),
    ]
      .filter((word) => !stop.has(word))
      .slice(0, 18);
    if (words.length) {
      const ranked = this.app.store.db
        .prepare(
          "SELECT rag_chunks.id FROM rag_fts JOIN rag_chunks ON rag_fts.id=rag_chunks.id WHERE rag_fts MATCH ? AND rag_chunks.course_id=? AND (?=0 OR rag_chunks.kind IN ('material','transcript','web-page')) ORDER BY bm25(rag_fts,0,2,1) LIMIT 50",
        )
        .all(
          words.map((word) => `"${word}"`).join(" OR "),
          courseId,
          courseOnly ? 1 : 0,
        ) as { id: string }[];
      ranked.forEach((item, i) => scores.set(item.id, 1 / (40 + i)));
    }
    const embedded = all.filter(
      (item) => item.embedding && item.model === embeddingModel,
    );
    if (
      embedded.length &&
      this.app.apiKey &&
      this.app.ai.config().mode === "personal" &&
      this.app.store.state().settings.assistantEnabled
    ) {
      try {
        const client = new OpenAI({
          apiKey: this.app.apiKey,
          timeout: 12000,
          maxRetries: 0,
        });
        const result = await client.embeddings.create({
          model: embeddingModel,
          dimensions: 384,
          input: query,
        });
        const vector = result.data[0].embedding;
        embedded
          .map((item) => ({
            id: item.id,
            score: cosine(vector, JSON.parse(item.embedding!)),
          }))
          .filter((item) => item.score > 0.25)
          .sort((a, b) => b.score - a.score)
          .slice(0, 30)
          .forEach((item, i) =>
            scores.set(item.id, (scores.get(item.id) || 0) + 1 / (40 + i)),
          );
      } catch {
        /* Keyword retrieval remains useful while embeddings are unavailable. */
      }
    }
    const diversity = new Map<string, number>();
    return all
      .filter((item) => scores.has(item.id))
      .sort(
        (a, b) =>
          scores.get(b.id)! +
          (b.lesson_id === lessonId && lessonId ? 0.002 : 0) -
          (scores.get(a.id)! +
            (a.lesson_id === lessonId && lessonId ? 0.002 : 0)),
      )
      .filter((item) => {
        const n = diversity.get(item.document_id) || 0;
        diversity.set(item.document_id, n + 1);
        return n < 2;
      })
      .slice(0, 6)
      .map((item) => ({
        id: item.id,
        title: item.title,
        text: item.text,
        kind: item.kind,
        lessonId: item.lesson_id,
        startLine: item.start_line,
        endLine: item.end_line,
      }));
  }
  async ask(
    courseId: string,
    question: string,
    mode: "help" | "course",
    selectedCode?: { path: string; content: string },
    runContext?: import("../shared.js").RunContext,
    tutorStyle: "hint" | "explain" = "explain",
    learningContext?: {
      architect?: ReturnType<import("./notebook.js").IdeaNotebook["context"]>;
      practice?: ReturnType<import("./practice.js").Practice["context"]>;
      contribution?: ReturnType<import("./live-work.js").LiveWork["context"]>;
      direction?: import("./learning-path.js").Direction;
      projectCommand?: Pick<
        import("./project-runtime.js").CommandRecord,
        "command" | "output" | "exitCode" | "state" | "truncated" | "finishedAt"
      >;
      project?: ReturnType<
        import("./learning-path.js").LearningPath["status"]
      >["milestones"];
    },
  ) {
    const course = this.course(courseId),
      state = this.app.store.state();
    if (!state.settings.assistantEnabled || !this.app.ai.ready())
      throw new UserError(
        "Enable OffCourse and choose an AI connection in Settings first.",
      );
    if (this.busy.has(courseId) || this.busy.size >= 3)
      throw new UserError(
        "The assistant is busy. Wait for the current request to finish.",
        409,
      );
    assertClean(
      question +
        JSON.stringify(selectedCode || {}) +
        JSON.stringify(runContext || {}) +
        JSON.stringify(learningContext || {}),
      "assistant question",
    );
    this.busy.add(courseId);
    try {
      const contextId =
        learningContext?.practice?.taskId ||
        learningContext?.contribution?.issue.url;
      let sources = await this.retrieve(
        courseId,
        question,
        state.session?.courseId === courseId ? state.session.lessonId : "",
        mode === "course",
      );
      if (learningContext?.practice?.reviewOf)
        sources = sources.filter(
          (s) =>
            !(
              s.kind === "code" &&
              s.title.includes("practice/") &&
              !s.title.includes(learningContext.practice!.path)
            ),
        );
      let text = "",
        responseMode = "grounded",
        recovery: ChatMessage["recovery"],
        cited = sources.map((source, i) => ({ ...source, number: i + 1 }));
      if (mode === "course" && !sources.length) {
        text =
          "I don’t have a matching passage yet. Save the lesson with the OutClass extension or add a transcript or resource in Sources.";
        responseMode = "missing-context";
      } else {
        const history = this.history(courseId)
          .filter((item) => item.projectId === learningContext?.architect?.id)
          .filter((item) => !contextId || item.contextId === contextId)
          .slice(-6)
          .map((item) => ({
            role: item.role,
            content: item.text.slice(0, 4000),
          }));
        const context = JSON.stringify({
          instructorAssignment: new LearnDelivery(this.app).teacherContext(
            courseId,
            state.session?.courseId === courseId ? state.session.lessonId : "",
          ),
          course: course.title,
          lesson:
            state.session?.courseId === courseId
              ? state.session.lessonTitle
              : "",
          mode,
          sources: sources.map((item, i) => ({
            number: i + 1,
            title: item.title,
            lines: `${item.startLine}-${item.endLine}`,
            text: item.text,
          })),
          selectedCode,
          tutorStyle,
          learningContext,
          guidance: teacherGuidance(
            learningContext?.practice,
            runContext,
            learningContext?.projectCommand,
          ),
          runContext: runContext
            ? {
                path: runContext.path,
                fileVersion: runContext.fileVersion,
                source: runContext.source,
                sourceTruncated: runContext.sourceTruncated,
                output: runContext.output,
                outputTruncated: runContext.outputTruncated,
                exitCode: runContext.exitCode,
                timedOut: runContext.timedOut,
                stopped: runContext.stopped,
                stale: runContext.stale,
                changedDuringRun: runContext.changedDuringRun,
                startedAt: runContext.startedAt,
                finishedAt: runContext.finishedAt,
              }
            : undefined,
        });
        try {
          const answer = await this.app.ai.structured({
            task: "teacher",
            schema: teacherAnswer,
            name: "course_answer",
            instructions: teacherInstructions,
            history,
            context: context + "\nQuestion: " + question,
          });
          if (
            !answer ||
            answer.answer.length > 14000 ||
            answer.citations.some((n) => n < 1 || n > sources.length) ||
            [...answer.answer.matchAll(/\[(\d+)\]/g)].some(
              (match) => !answer.citations.includes(Number(match[1])),
            )
          )
            throw new Error("Invalid grounded answer");
          assertClean(answer.answer, "assistant answer");
          text = answer.answer;
          const taskFunction = learningContext?.practice?.exercise.function;
          if (
            mode === "help" &&
            !protectsLearnerWork(
              text,
              tutorStyle,
              selectedCode?.content,
              taskFunction,
            )
          )
            text = fallbackTeacherHint(
              learningContext?.practice,
              runContext,
              learningContext?.projectCommand,
            );
          if (mode === "help")
            text = ensureDiagnosticQuestion(
              text,
              teacherGuidance(
                learningContext?.practice,
                runContext,
                learningContext?.projectCommand,
              ).stage,
              learningContext?.practice?.latestAttempt?.checks.find(
                (c) => !c.passed,
              )?.label,
            );
          cited = [...new Set(answer.citations)].map((n) => ({
            ...sources[n - 1],
            number: n,
          }));
          if (mode === "course" && !cited.length)
            text =
              "I couldn’t ground an answer in the retrieved course passages. Add the relevant lecture transcript or resource, then refresh the index and ask again.";
          responseMode = cited.length
            ? "grounded"
            : mode === "course"
              ? "missing-context"
              : "general";
        } catch (error) {
          text =
            error instanceof UserError &&
            [401, 402, 429, 503, 504].includes(error.status)
              ? error.message
              : "The AI assistant is unavailable right now. Your code and notes are safe. You can still inspect the matching local passages below and retry your question.";
          responseMode = "retrieval";
          recovery =
            error instanceof UserError && [401, 402].includes(error.status)
              ? "ai-settings"
              : "retry";
        }
      }
      if (learningContext?.architect) {
        const current = new IdeaNotebook(this.app).context(
          learningContext.architect.id,
          courseId,
        );
        if (current.revision !== learningContext.architect.revision)
          throw new UserError(
            "The shared notebook changed during this answer. Ask again using its current context.",
            409,
          );
      }
      const messages = [
        ...this.history(courseId),
        {
          id: randomUUID(),
          role: "user" as const,
          text: question,
          contextId,
          projectId: learningContext?.architect?.id,
          at: new Date().toISOString(),
        },
        {
          id: randomUUID(),
          role: "assistant" as const,
          text,
          contextId,
          projectId: learningContext?.architect?.id,
          sources: cited,
          mode: responseMode,
          recovery,
          at: new Date().toISOString(),
        },
      ].slice(-40);
      this.app.store.put(`chat:${courseId}`, messages);
      return { messages, ...messages[messages.length - 1] };
    } finally {
      this.busy.delete(courseId);
    }
  }
}
