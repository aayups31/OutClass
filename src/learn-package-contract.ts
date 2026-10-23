import { z } from "zod";
import { COURSE_LESSON_LIMIT } from "./course-limits.js";
export const starterPath = z
  .string()
  .min(1)
  .max(180)
  .refine(
    (value) =>
      !value.includes("\\") &&
      !value.startsWith("/") &&
      value
        .split("/")
        .every(
          (part) =>
            /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(part) &&
            !/^(node_modules|dist|build|coverage|venv|__pycache__)$/i.test(
              part,
            ) &&
            !/\.(pem|key|p12|pfx|cer|sqlite|db|log)$/i.test(part) &&
            !/^(credentials|id_rsa|id_ed25519|LEARN_BRIEF\.md)$/i.test(part) &&
            !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
        ),
    "Use a relative file path without hidden folders, parent traversal or reserved names.",
  );
export const learnPackage = z
  .object({
    minutes: z.number().int().min(5).max(240),
    prerequisiteLessons: z
      .array(
        z
          .number()
          .int()
          .min(0)
          .max(COURSE_LESSON_LIMIT - 1),
      )
      .max(12),
    acceptanceCriteria: z
      .array(z.string().trim().max(500))
      .max(12)
      .transform((v) => v.filter(Boolean))
      .refine((v) => v.length > 0, "Add at least one acceptance criterion."),
    hints: z
      .array(z.string().trim().max(800))
      .max(6)
      .transform((v) => v.filter(Boolean)),
    reflection: z.string().trim().max(1200),
    transferChallenge: z.string().trim().max(2000),
    starterFiles: z
      .array(
        z
          .object({ path: starterPath, content: z.string().max(40000) })
          .strict(),
      )
      .max(12),
  })
  .strict();
export type LearnPackage = z.infer<typeof learnPackage>;
export function learnPackageIssues(lessons: { learn?: LearnPackage }[]) {
  const issues: string[] = [];
  lessons.forEach((lesson, index) => {
    if (!lesson.learn) return;
    const p = lesson.learn;
    if (new Set(p.prerequisiteLessons).size !== p.prerequisiteLessons.length)
      issues.push(`Lesson ${index + 1}: remove duplicate prerequisites.`);
    if (p.prerequisiteLessons.some((n) => n >= lessons.length || n === index))
      issues.push(
        `Lesson ${index + 1}: choose another available prerequisite lesson.`,
      );
    if (
      new Set(p.starterFiles.map((f) => f.path.toLowerCase())).size !==
      p.starterFiles.length
    )
      issues.push(
        `Lesson ${index + 1}: starter file paths must be unique, including case.`,
      );
    if (p.starterFiles.reduce((n, f) => n + f.content.length, 0) > 160000)
      issues.push(
        `Lesson ${index + 1}: starter files must total at most 160,000 characters.`,
      );
  });
  const visiting = new Set<number>(),
    done = new Set<number>();
  function visit(index: number): boolean {
    if (visiting.has(index)) return true;
    if (done.has(index)) return false;
    visiting.add(index);
    for (const p of lessons[index]?.learn?.prerequisiteLessons || [])
      if (p < lessons.length && visit(p)) return true;
    visiting.delete(index);
    done.add(index);
    return false;
  }
  if (lessons.some((_, i) => visit(i)))
    issues.push(
      "Lesson prerequisites contain a cycle. Keep the learning path achievable.",
    );
  return issues;
}
