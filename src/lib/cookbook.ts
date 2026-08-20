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

/**
 * Where a cover image is allowed to live.
 *
 * Vercel Blob serves public files from `<store-id>.public.blob.vercel-storage.com`.
 * Anything else is refused, and that refusal is the point: the cover URL is
 * client-supplied — the browser uploads the file and posts the resulting URL
 * back in a hidden field — so without this check a crafted POST could point a
 * cookbook cover at any URL on the internet, and every member's dashboard would
 * then fetch it. An allowlist of one host makes that impossible to express.
 *
 * `next.config.ts` allows the same host to the image optimizer. Both are
 * needed: this one decides what may be *stored*, that one what may be *fetched*.
 */
const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

export function isCoverImageUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  return (
    url.protocol === "https:" &&
    url.hostname.endsWith(BLOB_HOST_SUFFIX) &&
    // A bare ".public.blob.vercel-storage.com" has no store id in front of it,
    // and `endsWith` alone would accept it.
    url.hostname.length > BLOB_HOST_SUFFIX.length
  );
}

// Empty → undefined, so clearing the field stores null rather than "". Mirrors
// cookbookDescriptionSchema.
export const coverImageUrlSchema = z
  .string()
  .trim()
  .refine((v) => v === "" || isCoverImageUrl(v), "That image can't be used.")
  .transform((v) => (v === "" ? undefined : v))
  .optional();

export const createCookbookSchema = z.object({
  title: cookbookTitleSchema,
  description: cookbookDescriptionSchema,
  coverImageUrl: coverImageUrlSchema,
});
