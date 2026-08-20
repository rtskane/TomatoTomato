import { z } from "zod";
import {
  COVER_COUNT,
  COVER_STYLES,
  COVER_TEXTURES,
  COVER_TITLE_FONTS,
  COVER_TITLE_SIZES,
  COVER_TITLE_POSITIONS,
  MIN_ZOOM,
  MAX_ZOOM,
} from "@/lib/book-covers";

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

/**
 * Which cover colour was picked, 1-based into `BOOK_COVERS`.
 *
 * Arrives as a string because it comes out of a FormData field, and empty
 * means "not chosen" rather than zero — the same empty → undefined convention
 * the description and cover URL use, so the service can write null and let the
 * colour keep being derived from the id.
 *
 * The range check is a guard against a crafted POST, not something a user can
 * trip: the designer only ever submits a number it rendered a swatch for.
 */
export const coverColorSchema = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : Number(v)))
  .pipe(
    z
      .number("That cover colour doesn't exist.")
      .int("That cover colour doesn't exist.")
      .min(1, "That cover colour doesn't exist.")
      .max(COVER_COUNT, "That cover colour doesn't exist.")
      .optional(),
  )
  // Trailing, and load-bearing: the `.optional()` inside the pipe only permits
  // an undefined *result*, which is what an empty string turns into. This one
  // permits an absent *field*, which is what a caller that never heard of the
  // designer sends. Without it, adding these fields would have broken every
  // existing caller of the schema.
  .optional();

/** Likewise for the style — an unknown value is refused, an absent one isn't. */
export const coverStyleSchema = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .pipe(z.enum(COVER_STYLES, "That cover style doesn't exist.").optional())
  .optional();

/**
 * The rest of the composed cover's vocabulary.
 *
 * All four follow the same shape as the style: empty or absent means "not
 * said", and anything outside the vocabulary is refused rather than coerced —
 * these can only come from a control that rendered the option, so a value that
 * isn't one of them is a hand-made request, not a user mistake.
 */
function vocabulary<const T extends readonly [string, ...string[]]>(
  values: T,
  message: string,
) {
  return z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .pipe(z.enum(values, message).optional())
    .optional();
}

export const coverTextureSchema = vocabulary(
  COVER_TEXTURES,
  "That cover texture doesn't exist.",
);
export const coverTitleFontSchema = vocabulary(
  COVER_TITLE_FONTS,
  "That title font doesn't exist.",
);
export const coverTitleSizeSchema = vocabulary(
  COVER_TITLE_SIZES,
  "That title size doesn't exist.",
);
export const coverTitlePositionSchema = vocabulary(
  COVER_TITLE_POSITIONS,
  "That title position doesn't exist.",
);

/**
 * A number posted by a slider or a drag: the focal point's two fractions and
 * the zoom.
 *
 * Out-of-range values are **clamped rather than refused**, unlike the
 * vocabularies above. These come from continuous controls, where a value a
 * hair outside the range is a rounding artefact rather than an attack, and
 * failing someone's whole save over `1.0000001` would be absurd. The clamp
 * bounds are the ones `BookCover` would apply at render time anyway.
 */
function fraction(min: number, max: number, fallback: number) {
  return z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : Number(v)))
    .pipe(z.number().optional())
    .optional()
    .transform((v) => {
      if (v === undefined || !Number.isFinite(v)) return undefined;
      return Math.min(max, Math.max(min, v));
    });
}

export const coverFocalSchema = fraction(0, 1, 0.5);
export const coverZoomSchema = fraction(MIN_ZOOM, MAX_ZOOM, MIN_ZOOM);

export const createCookbookSchema = z
  .object({
    title: cookbookTitleSchema,
    description: cookbookDescriptionSchema,
    coverImageUrl: coverImageUrlSchema,
    coverColor: coverColorSchema,
    coverStyle: coverStyleSchema,
    coverTexture: coverTextureSchema,
    coverTitleFont: coverTitleFontSchema,
    coverTitleSize: coverTitleSizeSchema,
    coverTitlePosition: coverTitlePositionSchema,
    coverFocalX: coverFocalSchema,
    coverFocalY: coverFocalSchema,
    coverZoom: coverZoomSchema,
  })
  /**
   * Settle the style, so nothing downstream has to reason about the two ways
   * it can be wrong.
   *
   * **Absent** means the caller didn't mention it — an old client, a direct
   * POST, a seed script. Those get the rule that applied before the designer
   * existed: a cookbook with a picture shows the picture, one without shows its
   * title. So adding the field breaks no existing caller.
   *
   * **PHOTO with no image** is the combination that can't be drawn. It is
   * folded back to TITLED rather than rejected, because there is nothing for
   * the user to fix — it means an upload failed or the image was removed after
   * the style was picked, and refusing the save would hold their title and
   * description hostage to it.
   */
  .transform((data) => {
    const style = data.coverStyle ?? (data.coverImageUrl ? "PHOTO" : "TITLED");
    return {
      ...data,
      coverStyle: style === "PHOTO" && !data.coverImageUrl ? "TITLED" : style,
    };
  });
