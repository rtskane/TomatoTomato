// The cover palette, shared by everything that draws a cookbook as a book: the
// shelf paints a whole book with it, the list a thumbnail-sized chip, and the
// cover designer both a row of swatches and a live preview. One cookbook has to
// be the same colour in all four places, so there is one table and no second
// copy of it.
//
// Framework-free (no next/*, no react) so the designer, the server components
// and the unit tests can all import it.

/** How a cover presents itself. Mirrors the `CoverStyle` enum in schema.prisma. */
export const COVER_STYLES = ["TITLED", "PLAIN", "PHOTO"] as const;
export type CoverStyle = (typeof COVER_STYLES)[number];

export function isCoverStyle(value: string): value is CoverStyle {
  return (COVER_STYLES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// The composed cover
//
// Everything below is a *finite vocabulary*, which is the whole design premise:
// a cover is composed from named choices rather than laid out freehand. That is
// what lets one component draw the same cover at 240px on the shelf, 128px in
// the designer and 36px in a list row and have all three agree — every value
// here resolves to something relative (a percentage of the cover's own width,
// or a fraction of the photograph), never a pixel.
// ---------------------------------------------------------------------------

export const COVER_TEXTURES = ["NONE", "LINEN", "GRID"] as const;
export type CoverTexture = (typeof COVER_TEXTURES)[number];

export const COVER_TITLE_FONTS = ["SERIF", "SANS"] as const;
export type CoverTitleFont = (typeof COVER_TITLE_FONTS)[number];

export const COVER_TITLE_SIZES = ["SMALL", "MEDIUM", "LARGE"] as const;
export type CoverTitleSize = (typeof COVER_TITLE_SIZES)[number];

export const COVER_TITLE_POSITIONS = ["TOP", "CENTER", "BOTTOM"] as const;
export type CoverTitlePosition = (typeof COVER_TITLE_POSITIONS)[number];

/**
 * The weave, as a class defined in theme.css.
 *
 * The pattern is drawn in `currentColor` there, so the component only has to
 * set the text colour to the cover's ink and the weave belongs to whichever of
 * the eight covers it lands on — no per-cover texture assets, and nothing to
 * re-do when the palette is re-pointed.
 */
/**
 * The label for `LINEN` is "Weave", not "Linen", and deliberately so: cover 8
 * is already called Linen, and two controls on the same screen answering to
 * one name is ambiguous to anyone navigating by name rather than by sight. The
 * stored enum keeps the material word; the label takes the one that is free.
 */
export const TEXTURES: Record<CoverTexture, { label: string; className: string | null }> = {
  NONE: { label: "None", className: null },
  LINEN: { label: "Weave", className: "cover-weave-linen" },
  GRID: { label: "Grid", className: "cover-weave-grid" },
};

/**
 * Title size as a percentage of the cover's width.
 *
 * MEDIUM is 8.3cqw because that is exactly what the shelf book was set at
 * before sizes existed (20px on a 240px book) — so a cookbook nobody has
 * restyled is unchanged to the pixel.
 */
export const TITLE_SIZES: Record<CoverTitleSize, { label: string; className: string }> = {
  SMALL: { label: "Small", className: "text-[6.2cqw]" },
  MEDIUM: { label: "Medium", className: "text-[8.3cqw]" },
  LARGE: { label: "Large", className: "text-[11cqw]" },
};

export const TITLE_FONTS: Record<CoverTitleFont, { label: string; className: string }> = {
  SERIF: { label: "Serif", className: "font-serif" },
  SANS: { label: "Sans", className: "font-sans" },
};

/**
 * Where the title sits *within the frame*. The frame itself never moves — it
 * is the label plate on the board, and sliding it around would stop the book
 * looking like a book.
 */
export const TITLE_POSITIONS: Record<
  CoverTitlePosition,
  { label: string; className: string }
> = {
  TOP: { label: "Top", className: "items-start" },
  CENTER: { label: "Centre", className: "items-center" },
  BOTTOM: { label: "Bottom", className: "items-end" },
};

/** How far in the photograph may be zoomed. 1 is "fits the board". */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;

export function isCoverTexture(v: string): v is CoverTexture {
  return (COVER_TEXTURES as readonly string[]).includes(v);
}
export function isCoverTitleFont(v: string): v is CoverTitleFont {
  return (COVER_TITLE_FONTS as readonly string[]).includes(v);
}
export function isCoverTitleSize(v: string): v is CoverTitleSize {
  return (COVER_TITLE_SIZES as readonly string[]).includes(v);
}
export function isCoverTitlePosition(v: string): v is CoverTitlePosition {
  return (COVER_TITLE_POSITIONS as readonly string[]).includes(v);
}

/** Keep a stored fraction inside 0–1; anything else is a hand-made request. */
export function clampFraction(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

export function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return MIN_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

/**
 * Everything about how a cover is composed, as one bag of props.
 *
 * Grouped into a type because it travels together everywhere — service to
 * view, view to component, form to action — and threading nine loose
 * parameters through each of those would be nine chances to drop one.
 */
export type CoverDesign = {
  coverColor: number;
  coverStyle: CoverStyle;
  coverImageUrl: string | null;
  coverTexture: CoverTexture;
  coverTitleFont: CoverTitleFont;
  coverTitleSize: CoverTitleSize;
  coverTitlePosition: CoverTitlePosition;
  coverFocalX: number;
  coverFocalY: number;
  coverZoom: number;
};

/** What a cookbook nobody has designed looks like. */
export const DEFAULT_COVER_DESIGN: Omit<CoverDesign, "coverColor"> = {
  coverStyle: "TITLED",
  coverImageUrl: null,
  coverTexture: "NONE",
  coverTitleFont: "SERIF",
  coverTitleSize: "MEDIUM",
  coverTitlePosition: "CENTER",
  coverFocalX: 0.5,
  coverFocalY: 0.5,
  coverZoom: 1,
};

export type BookCoverPalette = {
  /** 1-based, and what `Cookbook.coverColor` stores. Never renumber these. */
  id: number;
  /** Said out loud by the swatch's radio button — "Garnet", not "colour 2". */
  name: string;
  /** The cloth. */
  face: string;
  /** Type printed on the cloth, at the contrast ratio noted in theme.css. */
  ink: string;
  /** The spine, and the hairline where the spine meets the board. */
  shade: string;
  hairline: string;
  /** The debossed frame the title sits inside, on a TITLED cover. */
  frame: string;
  /** A diagonal wash that keeps a flat fill from reading as a rectangle. */
  sheen: string;
};

/**
 * The eight covers, as whole class strings.
 *
 * Tailwind scans source for *literal* class names, so these can't be built by
 * interpolating an index — `bg-book-cover-${n}` compiles to nothing. Spelling
 * them out is the price of the scanner, and it keeps the pairing of a cover
 * with its ink in one readable place. See theme.css for the contrast ratios.
 *
 * The alphas are uniform except on Linen: it is the one cover paler than the
 * page behind it, so a spine drawn at the same 15% disappears into the board.
 * It gets roughly double, which reads as the same depth of shadow rather than
 * the same number.
 */
export const BOOK_COVERS: readonly BookCoverPalette[] = [
  {
    id: 1,
    name: "Worn Ruby",
    face: "bg-book-cover-1",
    ink: "text-book-ink-1",
    shade: "bg-book-ink-1/15",
    hairline: "bg-book-ink-1/25",
    frame: "border-book-ink-1/30",
    sheen: "bg-linear-to-br from-book-ink-1/10 to-transparent",
  },
  {
    id: 2,
    name: "Garnet",
    face: "bg-book-cover-2",
    ink: "text-book-ink-2",
    shade: "bg-book-ink-2/15",
    hairline: "bg-book-ink-2/25",
    frame: "border-book-ink-2/30",
    sheen: "bg-linear-to-br from-book-ink-2/10 to-transparent",
  },
  {
    id: 3,
    name: "Dusty Bronze",
    face: "bg-book-cover-3",
    ink: "text-book-ink-3",
    shade: "bg-book-ink-3/15",
    hairline: "bg-book-ink-3/25",
    frame: "border-book-ink-3/30",
    sheen: "bg-linear-to-br from-book-ink-3/10 to-transparent",
  },
  {
    id: 4,
    name: "Alpine Amber",
    face: "bg-book-cover-4",
    ink: "text-book-ink-4",
    shade: "bg-book-ink-4/15",
    hairline: "bg-book-ink-4/25",
    frame: "border-book-ink-4/30",
    sheen: "bg-linear-to-br from-book-ink-4/10 to-transparent",
  },
  {
    id: 5,
    name: "Forest Ochre",
    face: "bg-book-cover-5",
    ink: "text-book-ink-5",
    shade: "bg-book-ink-5/15",
    hairline: "bg-book-ink-5/25",
    frame: "border-book-ink-5/30",
    sheen: "bg-linear-to-br from-book-ink-5/10 to-transparent",
  },
  {
    id: 6,
    name: "Oxblood",
    face: "bg-book-cover-6",
    ink: "text-book-ink-6",
    shade: "bg-book-ink-6/15",
    hairline: "bg-book-ink-6/25",
    frame: "border-book-ink-6/30",
    sheen: "bg-linear-to-br from-book-ink-6/10 to-transparent",
  },
  {
    id: 7,
    name: "Deep Olive",
    face: "bg-book-cover-7",
    ink: "text-book-ink-7",
    shade: "bg-book-ink-7/15",
    hairline: "bg-book-ink-7/25",
    frame: "border-book-ink-7/30",
    sheen: "bg-linear-to-br from-book-ink-7/10 to-transparent",
  },
  {
    id: 8,
    name: "Linen",
    face: "bg-book-cover-8",
    ink: "text-book-ink-8",
    shade: "bg-book-ink-8/30",
    hairline: "bg-book-ink-8/45",
    frame: "border-book-ink-8/35",
    sheen: "bg-linear-to-br from-book-ink-8/10 to-transparent",
  },
];

export const COVER_COUNT = BOOK_COVERS.length;

/**
 * The cover a cookbook gets when nobody has chosen one.
 *
 * Derived from the id rather than stored, so it's stable for a given cookbook
 * forever, identical on server and client (no hydration mismatch), and costs
 * no column. Neighbouring cuids differ in their tail, which is what this sums,
 * so books created together still land on different covers.
 *
 * This is now a *default*, not the answer: the moment someone opens the
 * designer and saves, `Cookbook.coverColor` holds their choice and this stops
 * being consulted for that cookbook. That is why the column is nullable rather
 * than backfilled — null means "nobody has said", which is a different fact
 * from "somebody picked Garnet", and only the second should be preserved.
 *
 * Widening the palette from five covers to eight changes what this returns, so
 * cookbooks nobody has designed yet get shuffled onto new colours once. That
 * is a real (if small) visual change for existing libraries, and it is the
 * price of the wider palette: an unchosen colour is a suggestion, and the
 * designer now exists to overrule it.
 */
export function derivedCoverColor(id: string): number {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  return (sum % COVER_COUNT) + 1;
}

/**
 * A colour to open the designer on for a cookbook that doesn't exist yet.
 *
 * Random, because the alternative is every cookbook whose owner didn't think
 * about the cover coming out the same colour — which is the wall of one colour
 * the palette exists to avoid. There is no id to derive from at this point, so
 * chance stands in for the hash.
 *
 * Must be called on the server and passed down as a prop, never used as a
 * `useState` initialiser: a value drawn during render differs between the
 * server pass and hydration, and React would report the mismatch.
 */
export function suggestCoverColor(): number {
  return Math.floor(Math.random() * COVER_COUNT) + 1;
}

export function isCoverColor(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= COVER_COUNT;
}

/**
 * Turn what the database holds into the colour to actually paint — the stored
 * choice when there is one, the id-derived suggestion when there isn't.
 *
 * Called once, at the service boundary, so that every view downstream receives
 * a plain number and none of them has to know that null was ever a
 * possibility. An out-of-range stored value falls back to the derived colour
 * rather than throwing: the column is a bare int with no CHECK constraint, and
 * a cover that renders as the wrong colour is a far smaller problem than a
 * dashboard that refuses to render at all.
 */
export function resolveCoverColor(id: string, stored?: number | null): number {
  return stored != null && isCoverColor(stored) ? stored : derivedCoverColor(id);
}

/**
 * The classes for a resolved colour. Guards its own range for the same reason
 * `resolveCoverColor` does — this is the last stop before JSX.
 */
export function paletteFor(color: number): BookCoverPalette {
  return BOOK_COVERS[color - 1] ?? BOOK_COVERS[0];
}
