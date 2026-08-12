import Link from "next/link";
import { formatIngredient, formatMinutes } from "@/lib/recipe-display";
import type { RecipeDetail } from "@/server/services/recipe-detail.service";

// Presentational: props in, markup out. Laid out the way food publications set
// a recipe — a masthead, a stats strip, then ingredients beside the method —
// because that's the order a cook actually reads in: what is this, how long
// will it take, what do I need, what do I do.

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
    <article className="mx-auto max-w-3xl px-4 py-10">
      <header>
        <div className="flex items-start justify-between gap-4">
          <h1 className="font-serif text-large-title leading-tight tracking-tight">
            {recipe.title}
          </h1>

          {/* Only for the author or the cookbook's owner — `canModify` is the
              same rule the update and delete actions enforce, so this link can
              never offer something the server would refuse. */}
          {recipe.canModify ? (
            <Link
              href={`/cookbooks/${recipe.cookbook.id}/recipes/${recipe.id}/edit`}
              className="mt-2 shrink-0 rounded-md px-3 py-1.5 text-subheadline font-medium text-foreground-secondary hover:bg-background-secondary"
            >
              Edit
            </Link>
          ) : null}
        </div>
        <p className="mt-4 text-subheadline text-foreground-tertiary">
          By {recipe.authorName}
        </p>
        {recipe.description ? (
          <p className="mt-5 font-serif text-headline leading-relaxed text-foreground-secondary">
            {recipe.description}
          </p>
        ) : null}
      </header>

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
