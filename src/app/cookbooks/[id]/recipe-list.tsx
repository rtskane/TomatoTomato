import Image from "next/image";
import Link from "next/link";
import LinkPending from "@/components/link-pending";
import type { RecipeSummary } from "@/server/services/cookbook.service";

// Presentational: props in, markup out. Renders its own empty state, and takes
// `canAddRecipes` only to word that empty state honestly — a viewer who can't
// add recipes shouldn't be told to add one.
//
// Two ways to draw a card. Once any recipe in the cookbook has a photo, the
// list becomes a grid of pictures the way NYT Cooking lays one out — photo on
// top, then the title and a line of detail — and a recipe without a photo gets
// a quiet tile in its place so the rows still line up. A cookbook with no
// photos at all keeps the text cards: a grid of empty tiles would be all
// placeholder and no recipe.

function EmptyState({ canAdd }: { canAdd: boolean }) {
  return (
    <div className="mt-6 rounded-lg border border-dashed border-border-strong px-6 py-12 text-center">
      <p className="font-medium">No recipes yet.</p>
      <p className="mt-1 text-subheadline text-foreground-secondary">
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
    <p className="mt-3 text-caption-1 text-foreground-tertiary">
      {parts.join(" · ")}
    </p>
  );
}

/** The photo, or a tile holding the dish's initial so the grid stays even. */
function RecipePhoto({ recipe }: { recipe: RecipeSummary }) {
  return (
    <div className="relative aspect-3/2 overflow-hidden rounded-md bg-background-secondary">
      {recipe.coverImageUrl ? (
        <Image
          src={recipe.coverImageUrl}
          // The title under it names the dish; the card's link is its label.
          alt=""
          fill
          sizes="(min-width: 1024px) 320px, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-full items-center justify-center font-serif text-large-title text-foreground-muted"
        >
          {recipe.title.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
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

  if (recipes.some((recipe) => recipe.coverImageUrl)) {
    return (
      <ul className="mt-6 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {recipes.map((recipe) => (
          <li
            key={recipe.id}
            className="group relative rounded-md focus-within:ring-2 focus-within:ring-border-input-strong focus-within:ring-offset-4"
          >
            <RecipePhoto recipe={recipe} />
            {/* The same stretched link as the text cards: one anchor, named
                for the recipe, laid over the whole card. */}
            <Link
              href={`/cookbooks/${cookbookId}/recipes/${recipe.id}`}
              className="mt-3 block outline-none after:absolute after:inset-0 after:rounded-md"
            >
              <h3 className="font-medium leading-snug group-hover:underline">
                {recipe.title}
              </h3>
              <LinkPending />
            </Link>
            <p className="mt-1 text-caption-1 text-foreground-muted">
              by {recipe.authorName}
            </p>
            <RecipeMeta recipe={recipe} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className="mt-6 grid gap-4 sm:grid-cols-2">
      {recipes.map((recipe) => (
        // `relative` anchors the stretched link, making the whole card a
        // click target; `focus-within:ring` keeps keyboard focus visible since
        // the link's own outline is suppressed.
        <li
          key={recipe.id}
          className="group relative rounded-lg border border-border p-4 transition-colors hover:border-border-input hover:bg-background-control focus-within:ring-2 focus-within:ring-border-input-strong"
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
            <p className="mt-1 line-clamp-2 text-subheadline text-foreground-secondary">
              {recipe.description}
            </p>
          ) : null}
          <RecipeMeta recipe={recipe} />
          <p className="mt-1 text-caption-1 text-foreground-muted">
            by {recipe.authorName}
          </p>
        </li>
      ))}
    </ul>
  );
}
