import Link from "next/link";
import LinkPending from "@/components/link-pending";
import BookCover from "@/components/book-cover";
import type { CookbookSummary } from "@/server/services/cookbook.service";
import CookbookMeta from "./cookbook-meta";

// Presentational: props in, markup out. The shelf view — each cookbook is a
// book, laid out two or three to a row. The empty state belongs to the
// container that switches between views, so it isn't repeated here.
//
// The book itself is drawn by `BookCover`, which the cover designer also
// renders: this file decides how books are *arranged*, not what one looks like.

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
          {/* aria-hidden because the title is repeated in the caption below,
              which is the link's accessible name — a screen reader should hear
              the cookbook once, not twice. */}
          <div aria-hidden>
            <BookCover
              title={cookbook.title}
              coverColor={cookbook.coverColor}
              coverStyle={cookbook.coverStyle}
              coverImageUrl={cookbook.coverImageUrl}
              sizes="(min-width: 1024px) 240px, 45vw"
              className="mx-auto aspect-3/4 w-full max-w-60 shadow-md transition-transform duration-150 group-hover:-translate-y-1"
            />
          </div>

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
