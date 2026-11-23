import { z } from "zod";
const text = (max: number) => z.string().trim().min(1).max(max);
export const lessonBlock = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), body: text(10000) }).strict(),
  z
    .object({
      kind: z.literal("code"),
      language: text(40),
      code: text(16000),
      explanation: text(2000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("table"),
      caption: text(500),
      headers: z.array(text(150)).min(1).max(8),
      rows: z
        .array(z.array(text(1000)).min(1).max(8))
        .min(1)
        .max(40),
    })
    .strict(),
  z
    .object({
      kind: z.literal("equation"),
      notation: text(1000),
      explanation: text(2000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("diagram"),
      caption: text(500),
      description: text(2000),
      nodes: z
        .array(z.object({ label: text(100), detail: text(400) }).strict())
        .min(2)
        .max(12),
    })
    .strict(),
  z
    .object({
      kind: z.literal("media"),
      resourceId: z.string().uuid(),
      caption: text(500),
      transcript: text(30000),
      captions: z.string().max(40000),
    })
    .strict(),
]);
export const lessonBlocks = z
  .array(lessonBlock)
  .max(60)
  .superRefine((blocks, ctx) =>
    blocks.forEach((block, index) => {
      if (
        block.kind === "table" &&
        block.rows.some((row) => row.length !== block.headers.length)
      )
        ctx.addIssue({
          code: "custom",
          path: [index, "rows"],
          message: "Every table row must match its column headings.",
        });
      if (
        block.kind === "media" &&
        block.captions &&
        !block.captions.startsWith("WEBVTT")
      )
        ctx.addIssue({
          code: "custom",
          path: [index, "captions"],
          message: "Use a WebVTT caption track beginning with WEBVTT.",
        });
    }),
  );
export type LessonBlock = z.infer<typeof lessonBlock>;
export function blocksText(blocks: LessonBlock[]) {
  return blocks
    .map((block) => {
      switch (block.kind) {
        case "text":
          return block.body;
        case "code":
          return `${block.explanation}\n\n${block.code}`;
        case "table":
          return `${block.caption}\n${block.headers.join(" | ")}\n${block.rows.map((row) => row.join(" | ")).join("\n")}`;
        case "equation":
          return `${block.notation}\n${block.explanation}`;
        case "diagram":
          return `${block.caption}\n${block.nodes.map((node) => `${node.label}: ${node.detail}`).join(" → ")}\n${block.description}`;
        case "media":
          return `${block.caption}\n${block.transcript}`;
      }
    })
    .join("\n\n");
}
