import {
  clampFraction,
  clampZoom,
  resolveCoverColor,
  type CoverDesign,
} from "@/lib/book-covers";
import { parseStoredElements } from "@/lib/cover-elements-schema";

// The read boundary for covers: a cookbook row's cover columns in, something a
// view can draw out. Its own module, apart from book-covers.ts, because
// checking the placed elements takes zod, and book-covers.ts is imported by
// the designer in the browser, where nothing parses with zod.

/** A cookbook row's cover columns, exactly as the database stores them. */
export type StoredCover = {
  id: string;
  coverImageUrl: string | null;
  coverColor: number | null;
  coverStyle: CoverDesign["coverStyle"];
  coverTexture: CoverDesign["coverTexture"];
  coverTitleFont: CoverDesign["coverTitleFont"];
  coverTitleSize: CoverDesign["coverTitleSize"];
  coverTitlePosition: CoverDesign["coverTitlePosition"];
  coverFocalX: number;
  coverFocalY: number;
  coverZoom: number;
  /** Plain JSON as far as the database is concerned — checked on the way out. */
  coverElements: unknown;
};

/**
 * The stored cover columns, as the shape a view can render.
 *
 * `toCoverDesign` is called at every read boundary, so `resolveCoverColor` and
 * the clamps happen in exactly one place and no view ever receives a null
 * colour or a focal point outside the picture.
 */
export function toCoverDesign(row: StoredCover): CoverDesign {
  return {
    coverColor: resolveCoverColor(row.id, row.coverColor),
    coverStyle: row.coverStyle,
    coverImageUrl: row.coverImageUrl,
    coverTexture: row.coverTexture,
    coverTitleFont: row.coverTitleFont,
    coverTitleSize: row.coverTitleSize,
    coverTitlePosition: row.coverTitlePosition,
    coverFocalX: clampFraction(row.coverFocalX),
    coverFocalY: clampFraction(row.coverFocalY),
    coverZoom: clampZoom(row.coverZoom),
    coverElements: parseStoredElements(row.coverElements),
  };
}
