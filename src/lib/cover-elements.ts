// What can be placed on top of a cover: text boxes, photos, shapes and
// stickers, each free to move, resize and rotate.
//
// The cloth underneath comes from lib/book-covers.ts — colour and weave.
// Elements are the freeform layer above it, the cookbook's own name among
// them (see "The title" below), kept deliberately small (see LIMITS) so a
// cover stays something you design in a minute rather than a page-layout
// program.
//
// Framework-free, like book-covers.ts, so the editor, the server and the tests
// all share one definition of what an element is. No zod in here, for the
// same reason as image-uploads.ts: the editor imports this in the browser. The
// validation lives in cover-elements-schema.ts.

// ---------------------------------------------------------------------------
// Geometry
//
// Every position and size is a fraction of the cover, never a pixel, for the
// same reason as everything else on the cover: one book is drawn at 240px on
// the shelf, ~280px in the editor and 36px in a list row, and an element has
// to land on the same part of the board at all three.
//
// `x`/`y` are the element's *centre*, as fractions of the board's width and
// height. Centre rather than corner because rotation and scaling both happen
// about it, so neither gesture has to move the element to keep it in place.
// ---------------------------------------------------------------------------

/**
 * The middle of the board's usable face, across. A little right of 0.5: the
 * spine takes the first 5% of the width, so anything meant to look centred is
 * centred here.
 */
export const BOARD_CENTRE_X = 0.525;

export const ELEMENT_TYPES = ["text", "photo", "shape", "sticker"] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];

/**
 * How many of each a cover can hold.
 *
 * Small on purpose. The point is room to make a cover your own, not a blank
 * canvas — every one of these is drawn on every book on every shelf, and a
 * cover with forty things on it reads as noise at 240px and as mud at 36px.
 */
export const LIMITS: Record<ElementType, number> = {
  text: 4,
  photo: 2,
  shape: 6,
  sticker: 8,
};

/** What each kind is called in the plural, for saying how many a cover holds. */
export const ELEMENT_PLURALS: Record<ElementType, string> = {
  text: "text boxes",
  photo: "photos",
  shape: "shapes",
  sticker: "stickers",
};

/** "A cover holds up to 8 stickers." — said by the editor and by the server alike. */
export function limitSentence(type: ElementType): string {
  return `A cover holds up to ${LIMITS[type]} ${ELEMENT_PLURALS[type]}.`;
}

export const MIN_EXTENT = 0.04;
/**
 * How thin a shape may be. Lower than `MIN_EXTENT` because a rule *is* thin:
 * a line starts at 1.2% of the board's height, and holding it to the general
 * minimum would save it three times as thick as it was drawn.
 */
export const MIN_THICKNESS = 0.008;
export const MAX_EXTENT = 1.5;
/**
 * How thick the drawn line of a hollow shape is, as a fraction of the board's
 * width: the fine rule of a frame, and the bolder one of an outlined
 * rectangle or circle. One definition, because the book draws the line and
 * the editor has to know where it is to tell a press on it from a press in
 * the empty middle.
 */
export const FRAME_LINE = 0.005;
export const OUTLINE_LINE = 0.016;
export const MIN_TEXT_SIZE = 3;
export const MAX_TEXT_SIZE = 24;

/**
 * The colours an element can be — the eight cloths plus white, and nothing
 * else.
 *
 * Tokens, not a picker: every one is already a colour the cover palette is
 * built from, so anything placed on a book belongs to the same shelf as the
 * book. Stored by key and resolved to a CSS variable at render time, so
 * re-pointing the palette in theme.css re-colours every element with it.
 *
 * Keys only; the names a person hears come from `BOOK_COVERS` where the
 * swatches are drawn.
 */
export const ELEMENT_COLORS = [
  "cover-1",
  "cover-2",
  "cover-3",
  "cover-4",
  "cover-5",
  "cover-6",
  "cover-7",
  "cover-8",
  "white",
] as const;

export type ElementColor = (typeof ELEMENT_COLORS)[number];

export function colorCss(id: ElementColor): string {
  // Cover 1's ink is the palette's white — the one place the theme names it.
  if (id === "white") return "var(--color-book-ink-1)";
  return `var(--color-book-${id})`;
}

/**
 * The colour new text starts in on a given cloth: whichever of white and the
 * darkest cover reads on it. Mirrors the `--book-ink-*` pairs in theme.css —
 * covers 1, 2, 6 and 7 carry white ink, the rest the dark neutral.
 */
export function inkFor(coverColor: number): ElementColor {
  return [1, 2, 6, 7].includes(coverColor) ? "white" : "cover-1";
}

export const TEXT_FONTS = ["SERIF", "SANS", "MONO"] as const;
export type TextFont = (typeof TEXT_FONTS)[number];

/** Three families that already ship with the app, so no webfont is added. */
export const TEXT_FONT_STYLES: Record<TextFont, { label: string; className: string }> = {
  SERIF: { label: "Serif", className: "font-serif" },
  SANS: { label: "Sans", className: "font-sans" },
  MONO: { label: "Mono", className: "font-mono" },
};

export const TEXT_ALIGNS = ["left", "center", "right"] as const;
export type TextAlign = (typeof TEXT_ALIGNS)[number];

export const SHAPE_KINDS = ["rect", "circle", "triangle", "line", "frame"] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  rect: "Rectangle",
  circle: "Circle",
  triangle: "Triangle",
  line: "Line",
  frame: "Frame",
};

export const PHOTO_MASKS = ["rect", "rounded", "circle"] as const;
export type PhotoMask = (typeof PHOTO_MASKS)[number];

/**
 * The stickers. Placeholder art for now (see components/cover-stickers.tsx);
 * the names are what is stored, so swapping in the real drawings later changes
 * every cover that uses them without touching a row.
 */
export const STICKERS = [
  { id: "tomato", label: "Tomato" },
  { id: "lemon", label: "Lemon" },
  { id: "chili", label: "Chilli" },
  { id: "herb", label: "Herb sprig" },
  { id: "whisk", label: "Whisk" },
  { id: "spoon", label: "Wooden spoon" },
  { id: "heart", label: "Heart" },
  { id: "star", label: "Star" },
] as const;

export type StickerName = (typeof STICKERS)[number]["id"];
export const STICKER_IDS = STICKERS.map((s) => s.id) as [StickerName, ...StickerName[]];

// ---------------------------------------------------------------------------
// The elements
// ---------------------------------------------------------------------------

type Placed = {
  id: string;
  /** Centre, as fractions of the board — see Geometry above. */
  x: number;
  y: number;
  /** Width as a fraction of the board's width. */
  w: number;
  /** Degrees clockwise, -180..180. */
  rotation: number;
};

export type TextElement = Placed & {
  type: "text";
  /**
   * `"title"` ties this text box to the cookbook's name: it draws whatever the
   * cookbook is called and ignores `text`, so renaming the cookbook renames
   * its cover. A cover has at most one. Absent on every other text box.
   */
  role?: "title";
  text: string;
  font: TextFont;
  /** Type size as a percentage of the board's width (cqw). */
  size: number;
  color: ElementColor;
  align: TextAlign;
  bold: boolean;
  italic: boolean;
};

export type PhotoElement = Placed & {
  type: "photo";
  url: string;
  /** Height as a fraction of the board's height. */
  h: number;
  mask: PhotoMask;
};

export type ShapeElement = Placed & {
  type: "shape";
  shape: ShapeKind;
  h: number;
  color: ElementColor;
  /**
   * Outline rather than fill. Rectangles and circles only — a frame is always
   * a (thin) outline and ignores this.
   */
  outline: boolean;
};

/** Square, so only a width: its height follows from the board's 3:4. */
export type StickerElement = Placed & {
  type: "sticker";
  sticker: StickerName;
};

export type CoverElement = TextElement | PhotoElement | ShapeElement | StickerElement;

export function hasOutline(shape: ShapeKind): boolean {
  return shape === "rect" || shape === "circle";
}

/** Any angle as the same turn within -180..180 (exclusive of 180), so equal rotations compare equal. */
export function foldAngle(degrees: number): number {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

// ---------------------------------------------------------------------------
// The title
//
// The cookbook's name is a text box like any other — moved, sized and styled
// the same way — except that its words come from the cookbook. That is what
// lets a rename reach the cover, and what lets the name be edited from the
// cover.
// ---------------------------------------------------------------------------

// A plain boolean rather than a type predicate: a predicate's "no" branch
// would tell the compiler the element isn't a text box at all, which is wrong
// for every text box that isn't the title.
export function isTitle(element: CoverElement): boolean {
  return element.type === "text" && element.role === "title";
}

export function titleElement(elements: readonly CoverElement[]): TextElement | null {
  for (const element of elements) {
    if (element.type === "text" && element.role === "title") return element;
  }
  return null;
}

/** Titles this long or shorter are drawn at the size the element says. */
const TITLE_FULL_SIZE_UNTIL = 20;
/** The longest a title can be (see `cookbookTitleSchema`), and its scale. */
const TITLE_LONGEST = 80;
const TITLE_SMALLEST_SCALE = 0.55;

/**
 * How much to shrink the title's type for a long name.
 *
 * A template is laid out around a name of ordinary length, and the same box
 * has to hold "Dinner" and an eighty-character family history without the
 * second one running off the bottom of the board. So the type steps down as
 * the name grows — smoothly, so typing one more letter never makes it jump.
 *
 * Applied where the element is drawn, not stored: the element keeps the size
 * its owner chose, and a later, shorter name gets that size back.
 */
export function titleScale(title: string): number {
  const length = title.trim().length;
  if (length <= TITLE_FULL_SIZE_UNTIL) return 1;
  const t = Math.min(1, (length - TITLE_FULL_SIZE_UNTIL) / (TITLE_LONGEST - TITLE_FULL_SIZE_UNTIL));
  return 1 - t * (1 - TITLE_SMALLEST_SCALE);
}

/** Every uploaded file the elements point at — for cleaning up after them. */
export function elementImages(elements: readonly CoverElement[]): string[] {
  return elements.flatMap((e) => (e.type === "photo" ? [e.url] : []));
}

export function countOf(elements: readonly CoverElement[], type: ElementType): number {
  return elements.filter((e) => e.type === type).length;
}

export function canAdd(elements: readonly CoverElement[], type: ElementType): boolean {
  return countOf(elements, type) < LIMITS[type];
}
