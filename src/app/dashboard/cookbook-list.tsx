import Link from "next/link";
import LinkPending from "@/components/link-pending";
import type { CookbookSummary } from "@/server/services/cookbook.service";

// Presentational: props in, markup out. Owns no data and does no fetching —
// the container hands it the rows. Renders the empty state itself so callers
// never have to branch.

function EmptyState() {
  return (
    <div className="mt-6 rounded-lg border border-dashed border-border-strong px-6 py-12 text-center">
      <p className="font-medium">No cookbooks yet.</p>
      <p className="mt-1 text-subheadline text-foreground-secondary">
        Create one to start collecting recipes.
      </p>
    </div>
  );
}

// "3 recipes · 2 members" — pluralized, and the role only when it's worth
// saying (every cookbook has an owner; being one isn't news on your own shelf).
function CookbookMeta({ cookbook }: { cookbook: CookbookSummary }) {
  const parts = [
    `${cookbook.recipeCount} ${cookbook.recipeCount === 1 ? "recipe" : "recipes"}`,
    `${cookbook.memberCount} ${cookbook.memberCount === 1 ? "member" : "members"}`,
  ];
  if (cookbook.role !== "OWNER") parts.push(cookbook.role.toLowerCase());

  return (
    <p className="mt-3 text-caption-1 text-foreground-tertiary">
      {parts.join(" · ")}
    </p>
  );
}

export default function CookbookList({
  cookbooks,
}: {
  cookbooks: CookbookSummary[];
}) {
  if (cookbooks.length === 0) return <EmptyState />;

  return (
    <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cookbooks.map((cookbook) => (
        // `relative` anchors the stretched link below, which is what makes the
        // whole card a click target.
        <li
          key={cookbook.id}
          className="group relative rounded-lg border border-border p-4 transition-colors hover:border-border-input hover:bg-background-control focus-within:ring-2 focus-within:ring-border-input-strong"
        >
          {/*
            Stretched-link pattern: one real anchor on the title, with an
            invisible ::after overlaying the entire card. The whole box is
            clickable, but assistive tech still sees a single link named after
            the cookbook — rather than one giant link that reads out the
            description and counts too. It also leaves room to add real buttons
            to the card later, which nesting everything inside an <a> would
            make invalid.
          */}
          <Link
            href={`/cookbooks/${cookbook.id}`}
            className="outline-none after:absolute after:inset-0 after:rounded-lg"
          >
            <h2 className="font-medium group-hover:underline">
              {cookbook.title}
            </h2>
            <LinkPending />
          </Link>
          {cookbook.description ? (
            <p className="mt-1 line-clamp-2 text-subheadline text-foreground-secondary">
              {cookbook.description}
            </p>
          ) : null}
          <CookbookMeta cookbook={cookbook} />
        </li>
      ))}
    </ul>
  );
}
