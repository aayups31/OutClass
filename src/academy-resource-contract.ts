import { z } from "zod";

export const ACADEMY_RESOURCE_MAX_BYTES = 80 * 1024 * 1024;
export const academyResource = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(180),
    kind: z.enum(["video", "pdf", "archive", "code"]),
    mime: z.string().min(1).max(80),
    bytes: z.number().int().positive().max(ACADEMY_RESOURCE_MAX_BYTES),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type AcademyResource = z.infer<typeof academyResource>;
