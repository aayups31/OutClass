import { z } from "zod";

export const accountEmail = z.string().trim().toLowerCase().email().max(254);
export const accountPassword = z.string().min(1).max(128);
export const accountSignIn = z.object({
  email: accountEmail,
  password: accountPassword,
});
export const accountRegistration = accountSignIn.extend({
  password: accountPassword.min(8),
});
export const accountConfirmation = z.object({
  email: accountEmail,
  code: z.string().regex(/^\d{6,8}$/),
});

export const progressSnapshot = z.object({
  courses: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        title: z.string().min(1).max(300),
        lesson: z.string().min(1).max(300).optional(),
        completed: z.number().int().min(0).max(1000),
        checkpoints: z.number().int().min(0).max(10000),
        activityAt: z.iso.datetime(),
      }),
    )
    .max(40),
  skills: z
    .array(
      z.object({
        language: z.enum(["javascript", "typescript", "python", "c", "cpp"]),
        skill: z.string().min(1).max(160),
      }),
    )
    .max(80),
});
export const progressUpload = z.object({
  deviceId: z.uuid(),
  snapshot: progressSnapshot,
});
export const sharedProgress = z.object({
  devices: z.array(progressSnapshot).max(12),
});
export type ProgressSnapshot = z.infer<typeof progressSnapshot>;
