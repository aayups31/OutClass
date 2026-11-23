import { academyLesson, type AcademyDraft } from "../expansion-contract.js";
import type { Store } from "./store.js";
import { UserError } from "./safety.js";
import { contentHash } from "../course-integrity.js";
export const lessonHash = contentHash;
export function courseManifest<T extends AcademyDraft>(course: T) {
  return {
    ...course,
    lessonHashes: course.lessons.map(lessonHash),
    lessons: course.lessons.map((lesson, index) => ({
      title: lesson.title,
      objective: lesson.objective.slice(0, 400),
      practice: lesson.practice.slice(0, 240),
      chapter: lesson.chapter,
      content: index === 0 ? lesson.content.slice(0, 1200) : "",
    })),
  };
}
/** Content-addressed immutable lessons keep course manifests small. Old inline courses remain readable. */
export function storeCourse<T extends AcademyDraft>(store: Store, course: T) {
  course.lessons.forEach((lesson) =>
    store.put(`academy:content:${lessonHash(lesson)}`, lesson),
  );
  return courseManifest(course);
}
export function loadCourse<T extends AcademyDraft>(store: Store, raw: T): T {
  const { lessonHashes, ...manifest } = raw as T & { lessonHashes?: string[] };
  if (!lessonHashes) return raw;
  if (lessonHashes.length !== raw.lessons.length)
    throw new UserError(
      "Incomplete course manifest. Restore its portable backup.",
    );
  const lessons = lessonHashes.map((hash) => {
    const lesson = store.get(`academy:content:${hash}`);
    if (!lesson || lessonHash(lesson) !== hash)
      throw new UserError(
        "A course lesson is missing or corrupt. Restore its portable backup.",
      );
    return academyLesson.parse(lesson);
  });
  return { ...manifest, lessons } as T;
}
