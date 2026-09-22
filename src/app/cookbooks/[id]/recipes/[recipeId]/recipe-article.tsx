import Image from "next/image";
import Link from "next/link";
import { formatIngredient, formatMinutes } from "@/lib/recipe-display";
import type { RecipeDetail } from "@/server/services/recipe-detail.service";

// Presentational: props in, markup out. Laid out the way food publications set
// a recipe — a masthead, a stats strip, then ingredients beside the method —
// because that's the order a cook actually reads in: what is this, how long
// will it take, what do I need, what do I do.
//
// A recipe with a photo is set the way NYT Cooking sets one: the title and
// byline on the left, the photograph beside them on the right, on a page wide
// enough to give it room. On a phone the photo drops under the byline at full
// width. Without a photo the page keeps its narrower single column — a wide
// page with nothing in the second column would just be an empty margin.

/** How wide the recipe page is — shared with the page's back link above it. */
export function articleWidth(recipe: Pick<RecipeDetail, "coverImageUrl">) {
  return recipe.coverImageUrl ? "max-w-5xl" : "max-w-3xl";
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-widest text-foreground-muted">
        {label}
      </dt>
      <dd className="mt-1 text-subheadline font-medium">{value}</dd>
    </div>
  );
}

function Stats({ recipe }: { recipe: RecipeDetail }) {
  const stats: { label: string; value: string }[] = [];
  if (recipe.servings !== null) {
    stats.push({ label: "Serves", value: String(recipe.servings) });
  }
  const prep = formatMinutes(recipe.prepTimeMinutes);
  if (prep) stats.push({ label: "Prep", value: prep });
  const cook = formatMinutes(recipe.cookTimeMinutes);
  if (cook) stats.push({ label: "Cook", value: cook });
  const total = formatMinutes(recipe.totalTimeMinutes);
  // Total only earns its place when it isn't just repeating a single number.
  if (total && prep && cook) stats.push({ label: "Total", value: total });

  if (stats.length === 0) return null;

  return (
    <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4 border-y border-border py-5">
      {stats.map((stat) => (
        <StatBlock key={stat.label} {...stat} />
      ))}
    </dl>
  );
}

export default function RecipeArticle({ recipe }: { recipe: RecipeDetail }) {
  return (
    <article className={`mx-auto ${articleWidth(recipe)} px-4 py-10`}>
      <header
        className={
          recipe.coverImageUrl
            ? "grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-center lg:gap-12"
            : undefined
        }
      >
        <div>
          <h1 className="font-serif text-large-title leading-tight tracking-tight">
            {recipe.title}
          </h1>
          <div className="mt-4 flex items-center gap-3">
            <p className="text-subheadline text-foreground-tertiary">
              By {recipe.authorName}
            </p>

            {/* Beside the byline rather than out at the column's edge, where
                beside a photo it would float free of anything it belongs to.
                Only for the author or the cookbook's owner — `canModify` is the
                same rule the update and delete actions enforce, so this link
                can never offer something the server would refuse. */}
            {recipe.canModify ? (
              <Link
                href={`/cookbooks/${recipe.cookbook.id}/recipes/${recipe.id}/edit`}
                className="rounded-md border border-border px-2.5 py-1 text-caption-1 font-medium text-foreground-secondary hover:bg-background-secondary"
              >
                Edit
              </Link>
            ) : null}
          </div>
        </div>

        {recipe.coverImageUrl ? (
          // Edge to edge on a phone, where the page's own gutter would only
          // shrink it; inside the column from `sm` up.
          <div className="relative -mx-4 aspect-3/2 overflow-hidden bg-background-secondary sm:mx-0 sm:rounded-md">
            <Image
              src={recipe.coverImageUrl}
              // The heading beside it already names the dish, and the photo
              // has no caption of its own to add, so it's announced as nothing
              // rather than as the title a second time.
              alt=""
              fill
              sizes="(min-width: 1024px) 600px, 100vw"
              // The largest thing on the page, and the first thing seen.
              loading="eager"
              fetchPriority="high"
              className="object-cover"
            />
          </div>
        ) : null}
      </header>

      {recipe.description ? (
        <p className="mt-6 max-w-3xl font-serif text-headline leading-relaxed text-foreground-secondary">
          {recipe.description}
        </p>
      ) : null}

      <Stats recipe={recipe} />

      {/* Ingredients sit beside the method on wide screens and above it on
          narrow ones — you read them first either way, and on a phone you
          shouldn't have to scroll past a sidebar to reach step one. */}
      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] lg:gap-14">
        <section>
          <h2 className="font-serif text-title-3">Ingredients</h2>
          <ul className="mt-4 space-y-0">
            {recipe.ingredients.map((ingredient) => (
              <li
                key={ingredient.id}
                className="border-b border-border py-2.5 text-subheadline leading-relaxed last:border-0"
              >
                {formatIngredient(ingredient)}
                {ingredient.note ? (
                  <span className="text-foreground-muted">
                    , {ingredient.note}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="font-serif text-title-3">Method</h2>
          <ol className="mt-4 space-y-6">
            {recipe.steps.map((step, index) => (
              <li key={step.id} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="shrink-0 font-serif text-date-num leading-none text-accent-ink tabular-nums"
                >
                  {index + 1}
                </span>
                <p className="font-serif text-headline leading-relaxed whitespace-pre-wrap">
                  {step.instruction}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </article>
  );
}
