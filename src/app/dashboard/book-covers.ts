// The cover palette for the dashboard's book view, shared by both views: the
// shelf paints a whole book with it, the list a thumbnail-sized chip, and a
// cookbook has to be the same colour in each.

/**
 * The five covers, as whole class strings.
 *
 * Tailwind scans source for *literal* class names, so these can't be built by
 * interpolating an index — `bg-book-cover-${n}` compiles to nothing. Spelling
 * them out is the price of the scanner, and it keeps the pairing of a cover
 * with its ink in one readable place. See theme.css for the contrast ratios.
 */
const COVERS = [
  {
    face: "bg-book-cover-1",
    ink: "text-book-ink-1",
    shade: "bg-book-ink-1/15",
    hairline: "bg-book-ink-1/25",
    frame: "border-book-ink-1/30",
  },
  {
    face: "bg-book-cover-2",
    ink: "text-book-ink-2",
    shade: "bg-book-ink-2/15",
    hairline: "bg-book-ink-2/25",
    frame: "border-book-ink-2/30",
  },
  {
    face: "bg-book-cover-3",
    ink: "text-book-ink-3",
    shade: "bg-book-ink-3/15",
    hairline: "bg-book-ink-3/25",
    frame: "border-book-ink-3/30",
  },
  {
    face: "bg-book-cover-4",
    ink: "text-book-ink-4",
    shade: "bg-book-ink-4/15",
    hairline: "bg-book-ink-4/25",
    frame: "border-book-ink-4/30",
  },
  {
    face: "bg-book-cover-5",
    ink: "text-book-ink-5",
    shade: "bg-book-ink-5/15",
    hairline: "bg-book-ink-5/25",
    frame: "border-book-ink-5/30",
  },
] as const;

/**
 * Which cover a cookbook gets. Derived from the id rather than stored, so it's
 * stable for a given cookbook forever, identical on server and client (no
 * hydration mismatch), and costs no column. Neighbouring cuids differ in their
 * tail, which is what this sums, so books created together still land on
 * different covers.
 */
export function coverFor(id: string) {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  return COVERS[sum % COVERS.length];
}
