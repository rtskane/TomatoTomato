import Link from "next/link";
import LinkPending from "@/components/link-pending";
import type { CookbookSummary } from "@/server/services/cookbook.service";
import CookbookMeta from "./cookbook-meta";

// Presentational: props in, markup out. The shelf view — each cookbook is a
// book, laid out two or three to a row. The empty state belongs to the
// container that switches between views, so it isn't repeated here.

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

/**
 * The book itself: spine down the left, page edges on the right, title set in
 * the serif inside a debossed frame.
 *
 * `aria-hidden` because the title is repeated in the caption below, which is
 * the link's accessible name — a screen reader should hear the cookbook once,
 * not twice.
 *
 * When cover images land, the image replaces the titled frame here and nothing
 * else on the shelf has to change.
 */
function BookFace({ cookbook }: { cookbook: CookbookSummary }) {
  const cover = coverFor(cookbook.id);

  return (
    <div
      aria-hidden
      className={`relative isolate mx-auto aspect-3/4 w-full max-w-60 overflow-hidden rounded-r-md rounded-l-xs shadow-md transition-transform duration-150 group-hover:-translate-y-1 ${cover.face}`}
    >
      {/* Spine: the ink at low alpha, so a dark cover gets an edge catching the
          light and a pale one an edge falling into shadow. */}
      <span className={`absolute inset-y-0 left-0 w-3 ${cover.shade}`} />
      <span className={`absolute inset-y-0 left-3 w-px ${cover.hairline}`} />

      {/* Fore-edge: the pages, inset top and bottom so the boards overhang. */}
      <span className="absolute inset-y-[3%] right-0 w-[3px] rounded-r-xs bg-background" />

      <div
        className={`absolute inset-y-4 right-4 left-7 flex items-center justify-center rounded-xs border px-2 text-center ${cover.frame}`}
      >
        <p
          className={`line-clamp-4 font-serif text-title-3 text-balance ${cover.ink}`}
        >
          {cookbook.title}
        </p>
      </div>
    </div>
  );
}

export default function CookbookShelf({
  cookbooks,
}: {
  cookbooks: CookbookSummary[];
}) {
  return (
    <ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-3">
      {cookbooks.map((cookbook) => (
        // `relative` anchors the stretched link, which is what makes the whole
        // book — cover and caption — one click target.
        <li
          key={cookbook.id}
          className="group relative rounded-lg focus-within:ring-2 focus-within:ring-border-input-strong focus-within:ring-offset-4 focus-within:ring-offset-background"
        >
          <BookFace cookbook={cookbook} />

          {/* The name sits under the book whether or not the cover shows it,
              the way a shelf label does. */}
          <div className="mt-3 text-center">
            <Link
              href={`/cookbooks/${cookbook.id}`}
              className="outline-none after:absolute after:inset-0 after:rounded-lg"
            >
              <h2 className="font-medium group-hover:underline">
                {cookbook.title}
              </h2>
              <LinkPending />
            </Link>
            <CookbookMeta cookbook={cookbook} className="mt-1" />
          </div>
        </li>
      ))}
    </ul>
  );
}
