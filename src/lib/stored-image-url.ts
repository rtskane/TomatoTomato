import { z } from "zod";
import { isStoredImageUrl } from "./image-uploads";

/**
 * An optional image field — a cookbook cover, a recipe photo — as the forms
 * submit it. Only a URL in our own blob store passes (see `isStoredImageUrl`),
 * and empty → undefined, so clearing the field stores null rather than "".
 */
export const storedImageUrlSchema = z
  .string()
  .trim()
  .refine((v) => v === "" || isStoredImageUrl(v), "That image can't be used.")
  .transform((v) => (v === "" ? undefined : v))
  .optional();
