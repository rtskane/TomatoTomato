import Link from "next/link";
import Image from "next/image";
import LinkPending from "@/components/link-pending";
import type { CookbookSummary } from "@/server/services/cookbook.service";
import CookbookMeta from "./cookbook-meta";
import { coverFor } from "./book-covers";

// Presentational: props in, markup out. The list view — one row per cookbook,
// dense enough to scan a long library at a glance. The empty state belongs to
// the container that switches between views, so it isn't repeated here.

export default function CookbookList({
  cookbooks,
}: {
  cookbooks: CookbookSummary[];
}) {
  return (
    <ul className="mt-6 divide-y divide-border overflow-hidden rounded-lg border border-border">
      {cookbooks.map((cookbook) => (
        // `relative` anchors the stretched link below, which is what makes the
        // whole row a click target.
        <li
          key={cookbook.id}
          className="group relative flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-background-secondary focus-within:ring-2 focus-within:ring-border-input-strong"
        >
          {/* A book-shaped chip, in the same colour this cookbook wears on the
              shelf, so switching views doesn't feel like a different library.
              Decorative — the title is right beside it. */}
          <div
            aria-hidden
            className={`relative h-12 w-9 shrink-0 overflow-hidden rounded-xs rounded-l-[1px] ${coverFor(cookbook.id).face}`}
          >
            {cookbook.coverImageUrl ? (
              <Image
                src={cookbook.coverImageUrl}
                alt=""
                fill
                sizes="36px"
                className="object-cover"
              />
            ) : null}
          </div>

          <div className="min-w-0 flex-1">
            {/*
              Stretched-link pattern: one real anchor on the title, with an
              invisible ::after overlaying the entire row. The whole box is
              clickable, but assistive tech still sees a single link named after
              the cookbook — rather than one giant link that reads out the
              description and counts too. It also leaves room to add real buttons
              to the row later, which nesting everything inside an <a> would
              make invalid.
            */}
            <Link
              href={`/cookbooks/${cookbook.id}`}
              className="outline-none after:absolute after:inset-0"
            >
              <h2 className="truncate font-medium group-hover:underline">
                {cookbook.title}
              </h2>
              <LinkPending />
            </Link>
            {cookbook.description ? (
              <p className="truncate text-subheadline text-foreground-secondary">
                {cookbook.description}
              </p>
            ) : null}
          </div>

          {/* Counts ride the right edge, so they line up down the list instead
              of sitting at a different place in every row. */}
          <CookbookMeta cookbook={cookbook} className="shrink-0" />
        </li>
      ))}
    </ul>
  );
}
