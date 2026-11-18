import { z } from "zod";
import { isStoredImageUrl } from "@/lib/image-uploads";
import {
  ELEMENT_COLORS,
  ELEMENT_TYPES,
  LIMITS,
  MAX_EXTENT,
  MAX_TEXT_SIZE,
  MIN_EXTENT,
  MIN_TEXT_SIZE,
  MIN_THICKNESS,
  PHOTO_MASKS,
  SHAPE_KINDS,
  STICKER_IDS,
  TEXT_ALIGNS,
  TEXT_FONTS,
  foldAngle,
  limitSentence,
  type CoverElement,
} from "@/lib/cover-elements";

// ---------------------------------------------------------------------------
// Validation
//
// Continuous values (position, size, angle) are clamped, the vocabularies
// refused — the same split lib/cookbook.ts makes, for the same reason: a drag
// that lands a hair outside the range is a rounding artefact, a colour that
// isn't in the palette is a hand-made request.
// ---------------------------------------------------------------------------

function clamped(min: number, max: number, fallback: number) {
  return z
    .number()
    .catch(fallback)
    .transform((v) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback));
}

/** Any angle, folded into -180..180 so equal rotations compare equal. */
const rotation = z
  .number()
  .catch(0)
  .transform((v) => {
    if (!Number.isFinite(v)) return 0;
    return Math.round(foldAngle(v) * 10) / 10;
  });

const placed = {
  id: z.string().regex(/^[a-z0-9-]{1,36}$/i, "That cover element can't be used."),
  x: clamped(0, 1, 0.5),
  y: clamped(0, 1, 0.5),
  w: clamped(MIN_EXTENT, MAX_EXTENT, 0.4),
  rotation,
};

const extent = clamped(MIN_EXTENT, MAX_EXTENT, 0.3);

const textSchema = z.object({
  ...placed,
  type: z.literal("text"),
  role: z.literal("title").optional(),
  text: z.string().max(120, "Keep text on the cover to 120 characters."),
  font: z.enum(TEXT_FONTS, "That font doesn't exist."),
  size: clamped(MIN_TEXT_SIZE, MAX_TEXT_SIZE, 8),
  color: z.enum(ELEMENT_COLORS, "That colour doesn't exist."),
  align: z.enum(TEXT_ALIGNS).catch("center"),
  bold: z.boolean().catch(false),
  italic: z.boolean().catch(false),
});

const photoSchema = z.object({
  ...placed,
  type: z.literal("photo"),
  url: z.string().refine(isStoredImageUrl, "That image can't be used."),
  h: extent,
  mask: z.enum(PHOTO_MASKS).catch("rect"),
});

const shapeSchema = z.object({
  ...placed,
  type: z.literal("shape"),
  shape: z.enum(SHAPE_KINDS, "That shape doesn't exist."),
  h: clamped(MIN_THICKNESS, MAX_EXTENT, 0.3),
  color: z.enum(ELEMENT_COLORS, "That colour doesn't exist."),
  outline: z.boolean().catch(false),
});

const stickerSchema = z.object({
  ...placed,
  type: z.literal("sticker"),
  sticker: z.enum(STICKER_IDS, "That sticker doesn't exist."),
});

export const coverElementSchema = z.discriminatedUnion("type", [
  textSchema,
  photoSchema,
  shapeSchema,
  stickerSchema,
]);

export const coverElementsSchema = z
  .array(coverElementSchema)
  // An empty text box draws nothing and can't be grabbed again, so it is
  // dropped rather than stored as an invisible obstacle. The title is the
  // exception: its words are the cookbook's name, not its own `text`.
  .transform((elements) =>
    elements.filter((e) => e.type !== "text" || e.role === "title" || e.text.trim() !== ""),
  )
  .superRefine((elements, ctx) => {
    for (const type of ELEMENT_TYPES) {
      const count = elements.filter((e) => e.type === type).length;
      if (count > LIMITS[type]) {
        ctx.addIssue({ code: "custom", message: limitSentence(type) });
      }
    }
    if (elements.filter((e) => e.type === "text" && e.role === "title").length > 1) {
      ctx.addIssue({ code: "custom", message: "A cover can show its title once." });
    }
    if (new Set(elements.map((e) => e.id)).size !== elements.length) {
      ctx.addIssue({ code: "custom", message: "That cover can't be saved." });
    }
  });

/**
 * The elements as the form posts them: one hidden field holding JSON.
 *
 * Absent or empty means "nothing placed", which is what a caller that never
 * heard of elements sends — the same convention as every other cover field.
 */
export const coverElementsFieldSchema = z
  .string()
  .optional()
  .transform((raw, ctx) => {
    if (raw === undefined || raw.trim() === "") return [];
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: "That cover can't be saved." });
      return z.NEVER;
    }
  })
  .pipe(coverElementsSchema);

/**
 * Elements as the database holds them, made safe to draw.
 *
 * Each element is checked on its own and a bad one is skipped rather than the
 * whole list thrown away: the column is plain JSON, so a hand edit or an older
 * shape could leave one element unreadable, and losing a sticker is a far
 * smaller problem than losing every photo beside it.
 */
export function parseStoredElements(stored: unknown): CoverElement[] {
  if (!Array.isArray(stored)) return [];
  return stored.flatMap((raw) => {
    const parsed = coverElementSchema.safeParse(raw);
    return parsed.success ? [parsed.data] : [];
  });
}
