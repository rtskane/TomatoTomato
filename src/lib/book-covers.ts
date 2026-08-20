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
