import type { CookbookSummary } from "@/server/services/cookbook.service";

// Presentational: props in, markup out. Owns no data and does no fetching —
// the container hands it the rows. Renders the empty state itself so callers
// never have to branch.

function EmptyState() {
  return (
    <div className="mt-6 rounded-lg border border-dashed border-black/15 px-6 py-12 text-center dark:border-white/20">
      <p className="font-medium">No cookbooks yet.</p>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
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
    <p className="mt-3 text-xs text-black/50 dark:text-white/50">
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
        <li
          key={cookbook.id}
          className="rounded-lg border border-black/10 p-4 dark:border-white/15"
        >
          {/* Not a link yet — the /cookbooks/[id] detail page doesn't exist. */}
          <h2 className="font-medium">{cookbook.title}</h2>
          {cookbook.description ? (
            <p className="mt-1 line-clamp-2 text-sm text-black/60 dark:text-white/60">
              {cookbook.description}
            </p>
          ) : null}
          <CookbookMeta cookbook={cookbook} />
        </li>
      ))}
    </ul>
  );
}
