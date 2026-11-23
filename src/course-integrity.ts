import { createHash } from "node:crypto";
import type { AcademyDraft } from "./expansion-contract.js";
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export const contentHash = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
export const technicalInputHash = (lesson: AcademyDraft["lessons"][number]) =>
  contentHash({
    check: lesson.codeCheck,
    files: lesson.learn?.starterFiles || [],
  });
