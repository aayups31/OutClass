import { randomUUID } from "node:crypto";
import type { Application } from "./application.js";
import type { CourseLibrary } from "./library.js";
import type { Practice, Exercise } from "./practice.js";
import { assertClean, scan, UserError } from "./safety.js";
import { teacherAnswer, teacherInstructions } from "../ai-contract.js";
import {
  lessonPractice,
  lessonPracticeInstructions,
} from "../lesson-practice-contract.js";
import { LearnDelivery } from "./learn-delivery.js";
import type { ResumeAnchor } from "../shared.js";
import { practiceLanguage } from "../project-types.js";
import { protectsLearnerWork } from "../teacher-guidance.js";

export type LibraryHit = {
  id: string;
  courseId: string;
  course: string;
  title: string;
  kind: string;
  excerpt: string;
  lessonId?: string;
  url?: string;
};

function terms(query: string) {
  return [
    ...new Set(query.toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) || []),
  ].slice(0, 9);
}
function excerpt(value: string, words: string[]) {
  const offset = words
    .map((word) => value.toLowerCase().indexOf(word))
    .filter((i) => i >= 0);
  const start = offset.length ? Math.max(0, Math.min(...offset) - 65) : 0;
  return `${start ? "…" : ""}${value.slice(start, start + 370)}`;
}
function readCase(value: string): unknown {
  return JSON.parse(value, (key, item) => {
    if (
      ["__proto__", "constructor", "prototype"].includes(key) ||
      (typeof item === "number" && !Number.isSafeInteger(item))
    )
      throw new Error("Unsupported value");
    return item;
  });
}

export class LearnTools {
  constructor(
    private app: Application,
    private library: CourseLibrary,
    private practice: Practice,
  ) {}
  next() {
    const state = this.app.configured();
    const dashboard = this.practice.dashboard();
    const course =
      state.courses.find((item) => item.id === state.session?.courseId) ||
      state.courses[0];
    const active = dashboard.tasks.find(
      (item) => item.courseId === course?.id && item.status === "active",
    );
    const suggested =
      dashboard.opportunities.find((item) => item.courseId === course?.id) ||
      dashboard.opportunities[0];
    const review = dashboard.reviewEnabled
      ? dashboard.reviews
          .filter((item) => Date.parse(item.dueAt) <= Date.now())
          .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0]
      : undefined;
    const courseId = active?.courseId || suggested?.courseId || course?.id;
    const choice = active?.exerciseId || suggested?.exerciseId;
    const completed = new Set(dashboard.tasks.filter((task) =>
      task.courseId === courseId && task.status === "completed").map((task) => task.exerciseId));
    const language = practiceLanguage(course?.title || "");
    const spec = choice ? dashboard.exercises.find((item) => item.id === choice)
      : dashboard.exercises.find((item) =>
        item.kind === "practice" && !item.retired && !item.requiresPracticals && !item.transferFrom &&
        (!language || language === item.language) && !completed.has(item.id));
    return {
      practical: spec && courseId
        ? {
            courseId,
            id: spec.id,
            taskId: active?.id,
            title: spec.title,
            minutes: spec.minutes,
            kind: spec.kind,
          }
        : null,
      review: review || null,
    };
  }
  async search(query: string): Promise<LibraryHit[]> {
    const state = this.app.configured();
    const words = terms(query);
    if (!words.length) return [];
    if (state.session)
      await this.library.index(state.session.courseId, false).catch(() => {});
    const hits: LibraryHit[] = [];
    const find = (hit: LibraryHit, content: string) => {
      if (
        words.every((word) =>
          `${hit.title} ${hit.course} ${content}`.toLowerCase().includes(word),
        ) &&
        !scan(content, hit.title).length
      )
        hits.push({ ...hit, excerpt: excerpt(content, words) });
    };
    const courseNames = new Map(
      state.courses.map((course) => [course.id, course]),
    );
    for (const course of state.courses) {
      for (const lesson of course.lessons.filter((item) => !item.archived))
        find(
          {
            id: `${course.id}:${lesson.id}`,
            courseId: course.id,
            course: course.title,
            title: lesson.title,
            kind: "Lesson",
            excerpt: "",
            lessonId: lesson.id,
            url: lesson.url,
          },
          lesson.section,
        );
      const anchor = this.app.store.get<ResumeAnchor>(`resume:${course.id}`);
      const session =
        state.session?.courseId === course.id ? state.session : undefined;
      const note = session?.note ?? anchor?.note;
      if (note)
        find(
          {
            id: `note:${course.id}`,
            courseId: course.id,
            course: course.title,
            title: "Learning note",
            kind: "Note",
            excerpt: "",
            lessonId: session?.lessonId || anchor?.lessonId,
          },
          note,
        );
    }
    for (const checkpoint of state.checkpoints)
      find(
        {
          id: checkpoint.id,
          courseId: checkpoint.courseId,
          course: checkpoint.courseTitle,
          title: checkpoint.message.split("\n")[0],
          kind: "Checkpoint",
          excerpt: "",
          lessonId: checkpoint.lessonId,
        },
        [checkpoint.lessonTitle, checkpoint.reflection, ...checkpoint.files]
          .filter(Boolean)
          .join("\n"),
      );
    const rows = this.app.store.db
      .prepare(
        "SELECT c.id,c.document_id,c.course_id,c.title,c.text,c.kind,c.lesson_id FROM rag_fts JOIN rag_chunks c ON c.id=rag_fts.id WHERE rag_fts MATCH ? ORDER BY bm25(rag_fts,0,2,1) LIMIT 120",
      )
      .all(words.map((word) => `"${word}"`).join(" AND ")) as unknown as {
      id: string;
      document_id: string;
      course_id: string;
      title: string;
      text: string;
      kind: string;
      lesson_id: string;
    }[];
    const seen = new Set<string>();
    const passages = rows.flatMap((row) => {
      const course = courseNames.get(row.course_id);
      if (
        !course ||
        seen.has(row.document_id) ||
        scan(row.text, row.title).length
      )
        return [];
      seen.add(row.document_id);
      const lesson = course.lessons.find((item) => item.id === row.lesson_id);
      return [
        {
          id: row.id,
          courseId: course.id,
          course: course.title,
          title: row.title,
          kind:
            row.kind === "code"
              ? "Code"
              : row.kind === "notes"
                ? "Note"
                : "Source",
          excerpt: excerpt(row.text, words),
          lessonId: lesson?.id,
          url: lesson?.url,
        },
      ];
    });
    return [...hits.slice(0, 25), ...passages].slice(0, 60);
  }
  async ask(courseIds: string[], question: string) {
    this.app.configured();
    assertClean(question, "library question");
    const groups = await Promise.all(
      [...new Set(courseIds)].map(async (id) => {
        const course = this.library.course(id);
        const evidence = await this.library.retrieve(id, question, "", true);
        return evidence
          .slice(0, 3)
          .map((source) => ({
            ...source,
            courseId: id,
            course: course.title,
            url: course.lessons.find((lesson) => lesson.id === source.lessonId)
              ?.url,
          }));
      }),
    );
    const sources = groups
      .flat()
      .map((source, index) => ({ ...source, number: index + 1 }));
    if (!sources.length)
      return {
        answer:
          "No matching passages in those courses. Try different words or save material from a lesson.",
        sources,
      };
    this.requireAI();
    const result = await this.app.ai.structured({
      task: "teacher",
      name: "course_answer",
      schema: teacherAnswer,
      instructions: teacherInstructions,
      context: JSON.stringify({
        mode: "course",
        question,
        sources: sources.map(
          ({ number, title, course, text, startLine, endLine }) => ({
            number,
            title,
            course,
            text,
            startLine,
            endLine,
          }),
        ),
        request:
          "Answer across the selected sources. Use [n] citations. Flag differences between courses.",
      }),
    });
    const references = [...result.answer.matchAll(/\[(\d+)\]/g)].map((match) =>
      Number(match[1]),
    );
    if (
      !result.citations.length ||
      !references.length ||
      result.citations.some((n) => !sources[n - 1]) ||
      references.some((n) => !result.citations.includes(n))
    )
      throw new UserError(
        "OffCourse could not cite its answer. Try a narrower question.",
        422,
      );
    assertClean(result.answer, "library answer");
    if (!protectsLearnerWork(result.answer, "hint"))
      throw new UserError("Ask OffCourse for an explanation or a hint about the material.", 422);
    return {
      answer: result.answer,
      sources: sources.filter((item) => result.citations.includes(item.number)),
    };
  }
  private requireAI() {
    if (
      !this.app.configured().settings.assistantEnabled ||
      !this.app.ai.ready()
    )
      throw new UserError("Connect and enable an AI guide in Settings first.");
  }
  async draft(
    courseId: string,
    lessonId: string,
    language: "javascript" | "python" | "typescript",
  ) {
    const course = this.library.course(courseId);
    const lesson = course.lessons.find(
      (item) => item.id === lessonId && !item.archived,
    );
    if (!lesson) throw new UserError("Choose a saved lesson.");
    const saved = this.library.lessonMaterial(courseId, lessonId) ||
      this.app.store.db.prepare(
        "SELECT content FROM rag_documents WHERE course_id=? AND lesson_id=? AND generated=0 AND kind='material' ORDER BY created_at DESC LIMIT 1",
      ).get(courseId, lessonId) as { content: string } | undefined;
    const academy =
      course.platform === "academy"
        ? new LearnDelivery(this.app).snapshot(courseId, lessonId)
        : undefined;
    const material = saved?.content || academy?.content;
    if (!material?.trim())
      throw new UserError(
        "Save lesson material or a transcript before drafting a practical.",
      );
    this.requireAI();
    const answer = await this.app.ai.structured({
      task: "lesson_practice",
      name: "lesson_practice",
      schema: lessonPractice,
      instructions: lessonPracticeInstructions,
      context: JSON.stringify({
        language,
        course: course.title,
        lesson: lesson.title,
        material: material.slice(0, 8500),
      }),
    });
    assertClean(JSON.stringify(answer), "lesson practical");
    let cases: Exercise["cases"];
    try {
      cases = answer.cases.map(({ label, inputJson, outputJson }) => ({
        label,
        args: [readCase(inputJson)],
        expected: readCase(outputJson),
      }));
      if (
        new Set(cases.map((item) => JSON.stringify(item.args))).size !==
          cases.length ||
        new Set(cases.map((item) => item.label)).size !== cases.length
      )
        throw Error();
    } catch {
      throw new UserError(
        "The draft returned invalid or repeated check data. Generate it again.",
        422,
      );
    }
    const spec: Exercise = {
      ...answer,
      id: `lesson-${randomUUID()}`,
      kind: "practice",
      language,
      function: "solve",
      cases,
      topics: [],
      retired: true,
      starter:
        language === "python"
          ? "def solve(value):\n    raise NotImplementedError()\n"
          : `export function solve(value${language === "typescript" ? ": unknown" : ""}) {\n  throw new Error("Not implemented");\n}\n`,
    };
    this.practice.saveLessonExercise(courseId, lessonId, spec);
    return {
      id: spec.id,
      title: spec.title,
      skill: spec.skill,
      brief: spec.brief,
      requirements: spec.requirements,
      minutes: spec.minutes,
      starter: spec.starter,
      checks: cases.map(({ label, args, expected }) => ({
        label,
        input: args[0],
        expected,
      })),
    };
  }
}
