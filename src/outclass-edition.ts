export type OutClassEdition = "learn" | "educator" | "combined";

export const LEARN_PORT = 47831;
export const EDUCATOR_PORT = 47862;

export function outClassEdition(value: unknown): OutClassEdition {
  return value === "learn" || value === "educator" ? value : "combined";
}
