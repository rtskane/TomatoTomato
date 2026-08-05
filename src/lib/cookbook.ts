import { z } from "zod";

// Validation for cookbook input. Lives in lib/ (not the service) so the same
// rules are importable from anywhere — including, later, a client-side check.

// Titles are trimmed and required. Unlike usernames they are NOT unique and
// NOT normalized for case: "Weeknight Dinners" is the user's own wording.
export const cookbookTitleSchema = z
  .string()
  .trim()
  .min(1, "Give your cookbook a title.")
  .max(80, "Title must be 80 characters or fewer.");

// Optional free text: trims, caps length, empty → undefined so we store null
// rather than "". Mirrors optionalNameSchema in lib/username.ts.
export const cookbookDescriptionSchema = z
  .string()
  .trim()
  .max(500, "Description must be 500 characters or fewer.")
  .transform((v) => (v === "" ? undefined : v))
  .optional();

export const createCookbookSchema = z.object({
  title: cookbookTitleSchema,
  description: cookbookDescriptionSchema,
});
