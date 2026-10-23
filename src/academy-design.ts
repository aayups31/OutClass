import type { AcademyDraft } from "./expansion-contract.js";

/** Reorder by original position, preserving prerequisite and project references. */
export function arrangeLessons(
  course: AcademyDraft,
  order: number[],
): AcademyDraft {
  if (
    new Set(order).size !== order.length ||
    order.some(
      (i) => !Number.isInteger(i) || i < 0 || i >= course.lessons.length,
    )
  )
    throw Error("Choose each existing lesson at most once.");
  const positions = new Map(order.map((old, next) => [old, next]));
  return {
    ...course,
    lessons: order.map((i) => {
      const lesson = course.lessons[i];
      return {
        ...lesson,
        ...(lesson.learn
          ? {
              learn: {
                ...lesson.learn,
                prerequisiteLessons: lesson.learn.prerequisiteLessons
                  .filter((p) => positions.has(p))
                  .map((p) => positions.get(p)!),
              },
            }
          : {}),
      };
    }),
    ...(course.learningProject
      ? {
          learningProject: {
            ...course.learningProject,
            milestones: course.learningProject.milestones
              .filter((m) => positions.has(m.lessonIndex))
              .map((m) => ({
                ...m,
                lessonIndex: positions.get(m.lessonIndex)!,
              }))
              .sort((a, b) => a.lessonIndex - b.lessonIndex),
          },
        }
      : {}),
  };
}

/** Bounded source excerpts, never a generated summary. Stored material remains intact. */
export function lessonEvidence(content: string, query: string, budget = 16000) {
  if (content.length <= budget) return { text: content, complete: true };
  const terms = [
    ...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || []),
  ];
  const parts: { index: number; text: string; score: number }[] = [];
  let offset = 0;
  for (const paragraph of content.split(/\n\s*\n/)) {
    for (let i = 0; i < paragraph.length; i += 1500) {
      const text = paragraph.slice(i, i + 1500);
      parts.push({
        index: offset++,
        text,
        score: terms.reduce(
          (n, t) => n + (text.toLowerCase().includes(t) ? 1 : 0),
          0,
        ),
      });
    }
  }
  const selected: typeof parts = [];
  let length = 0;
  for (const p of [...parts].sort(
    (a, b) => b.score - a.score || a.index - b.index,
  )) {
    if (length + p.text.length + 2 > budget) continue;
    selected.push(p);
    length += p.text.length + 2;
  }
  return {
    text: selected
      .sort((a, b) => a.index - b.index)
      .map((p) => p.text)
      .join("\n\n"),
    complete: false,
  };
}
