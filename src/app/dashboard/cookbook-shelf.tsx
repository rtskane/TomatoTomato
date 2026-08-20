import Link from "next/link";
import Image from "next/image";
import LinkPending from "@/components/link-pending";
import type { CookbookSummary } from "@/server/services/cookbook.service";
import CookbookMeta from "./cookbook-meta";
import { coverFor } from "./book-covers";

// Presentational: props in, markup out. The shelf view — each cookbook is a
// book, laid out two or three to a row. The empty state belongs to the
// container that switches between views, so it isn't repeated here.

/**
 * The book itself: spine down the left, page edges on the right, title set in
 * the serif inside a debossed frame.
 *
 * `aria-hidden` because the title is repeated in the caption below, which is
 * the link's accessible name — a screen reader should hear the cookbook once,
 * not twice.
 *
 * A cookbook with an uploaded cover shows it in place of the titled frame; the
 * spine and page edges stay on top either way, so a photographed book and a
 * plain one still read as the same object.
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

      {cookbook.coverImageUrl ? (
        // -z-10 puts the photo under the spine and fore-edge drawn above,
        // rather than over them. `alt=""` because the caption below already
        // names the cookbook — see the aria-hidden note above.
        <Image
          src={cookbook.coverImageUrl}
          alt=""
          fill
          sizes="(min-width: 1024px) 240px, 45vw"
          className="-z-10 object-cover"
        />
      ) : (
        <div
          className={`absolute inset-y-4 right-4 left-7 flex items-center justify-center rounded-xs border px-2 text-center ${cover.frame}`}
        >
          <p
            className={`line-clamp-4 font-serif text-title-3 text-balance ${cover.ink}`}
          >
            {cookbook.title}
          </p>
        </div>
      )}
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
