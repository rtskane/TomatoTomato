import Link from "next/link";
import LinkPending from "@/components/link-pending";
import type { RecipeSummary } from "@/server/services/cookbook.service";

// Presentational: props in, markup out. Renders its own empty state, and takes
// `canAddRecipes` only to word that empty state honestly — a viewer who can't
// add recipes shouldn't be told to add one.

function EmptyState({ canAdd }: { canAdd: boolean }) {
  return (
    <div className="mt-6 rounded-lg border border-dashed border-black/15 px-6 py-12 text-center dark:border-white/20">
      <p className="font-medium">No recipes yet.</p>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        {canAdd
          ? "Add the first one to get this cookbook started."
          : "Nothing has been added to this cookbook yet."}
      </p>
    </div>
  );
}

// "Serves 4 · 15 min prep · 30 min cook" — each part appears only when known,
// since every one of these fields is nullable.
function RecipeMeta({ recipe }: { recipe: RecipeSummary }) {
  const parts: string[] = [];
  if (recipe.servings !== null) parts.push(`Serves ${recipe.servings}`);
  if (recipe.prepTimeMinutes !== null) {
    parts.push(`${recipe.prepTimeMinutes} min prep`);
  }
  if (recipe.cookTimeMinutes !== null) {
    parts.push(`${recipe.cookTimeMinutes} min cook`);
  }
  parts.push(
    `${recipe.ingredientCount} ${recipe.ingredientCount === 1 ? "ingredient" : "ingredients"}`,
  );
  parts.push(`${recipe.stepCount} ${recipe.stepCount === 1 ? "step" : "steps"}`);

  return (
    <p className="mt-3 text-xs text-black/50 dark:text-white/50">
      {parts.join(" · ")}
    </p>
  );
}

export default function RecipeList({
  recipes,
  canAddRecipes,
  cookbookId,
}: {
  recipes: RecipeSummary[];
  canAddRecipes: boolean;
  cookbookId: string;
}) {
  if (recipes.length === 0) return <EmptyState canAdd={canAddRecipes} />;

  return (
    <ul className="mt-6 grid gap-4 sm:grid-cols-2">
      {recipes.map((recipe) => (
        // `relative` anchors the stretched link, making the whole card a
        // click target; `focus-within:ring` keeps keyboard focus visible since
        // the link's own outline is suppressed.
        <li
          key={recipe.id}
          className="group relative rounded-lg border border-black/10 p-4 transition-colors hover:border-black/25 hover:bg-black/[0.02] focus-within:ring-2 focus-within:ring-red-500 dark:border-white/15 dark:hover:border-white/30 dark:hover:bg-white/[0.03]"
        >
          {/* Stretched-link pattern, as on the dashboard cards: one anchor on
              the title with an invisible ::after over the card, so assistive
              tech hears a single link named for the recipe rather than one
              that also reads out the description, counts and author. */}
          <Link
            href={`/cookbooks/${cookbookId}/recipes/${recipe.id}`}
            className="outline-none after:absolute after:inset-0 after:rounded-lg"
          >
            <h3 className="font-medium group-hover:underline">{recipe.title}</h3>
            <LinkPending />
          </Link>
          {recipe.description ? (
            <p className="mt-1 line-clamp-2 text-sm text-black/60 dark:text-white/60">
              {recipe.description}
            </p>
          ) : null}
          <RecipeMeta recipe={recipe} />
          <p className="mt-1 text-xs text-black/40 dark:text-white/40">
            by {recipe.authorName}
          </p>
        </li>
      ))}
    </ul>
  );
}
