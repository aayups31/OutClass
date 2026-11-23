import { z } from "zod";
const selections = z.array(z.string().trim().min(1).max(100)).max(15);
export const accountProfile = z
  .object({
    name: z.string().trim().min(1).max(100),
    interests: selections,
    learningGoals: selections,
    industries: selections,
  })
  .strict();
export const accountCredentials = z
  .object({
    email: z.string().trim().email().max(254),
    password: z.string().min(12).max(128),
  })
  .strict();
