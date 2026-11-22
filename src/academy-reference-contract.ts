import { z } from "zod";

const httpsUrl = z
  .string()
  .max(2000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !/[\s<>]/u.test(value)
      );
    } catch {
      return false;
    }
  }, "Use an HTTPS source URL without embedded credentials.");

export const academyReference = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().max(200),
    publisher: z.string().trim().max(200),
    authors: z.string().trim().max(300),
    url: z.union([z.literal(""), httpsUrl]),
    license: z.string().trim().max(200),
    licenseUrl: z.union([z.literal(""), httpsUrl]),
    permissionNote: z.string().trim().max(1000),
    excerpt: z.string().trim().max(12000),
    approved: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.approved &&
      (!value.title ||
        !value.publisher ||
        !value.authors ||
        !value.url ||
        !value.license ||
        value.license === "Permission not yet reviewed" ||
        value.permissionNote.length < 20 ||
        !value.excerpt)
    )
      context.addIssue({
        code: "custom",
        message:
          "Before approving a reference, add its title, publisher, author, URL, license, excerpt and a permission note of at least 20 characters.",
      });
  });
export type AcademyReference = z.infer<typeof academyReference>;

export function referenceCredits(references: AcademyReference[] = []) {
  const approved = references.filter(
    (reference) => reference.approved && reference.excerpt,
  );
  if (!approved.length) return "";
  const escape = (text: string) =>
    text.replace(/[\\[\]*_`]/g, "\\$&").replace(/[\r\n]+/g, " ");
  return (
    "## Source acknowledgments\n\n" +
    approved
      .map(
        (reference) =>
          `- ${escape(reference.title)} — ${escape(reference.authors)}; ${escape(reference.publisher)}. Source: <${reference.url.replace(/>/g, "%3E")}>. License/permission: ${escape(reference.license)}.${reference.licenseUrl ? ` Terms: <${reference.licenseUrl.replace(/>/g, "%3E")}>.` : ""} Instructor's use note: ${escape(reference.permissionNote)}`,
      )
      .join("\n") +
    "\n\nOutClass teaching material is independently prepared. Source institutions do not endorse this course. Consult the originals for their full context.\n"
  );
}
