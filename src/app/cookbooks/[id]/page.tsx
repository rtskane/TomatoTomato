import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/user";
import { getCookbookDetail } from "@/server/services/cookbook.service";
import RecipeList from "./recipe-list";

// Container: owns auth + data, hands rows to the presentational list.
export default async function CookbookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireOnboardedUser();
  const cookbook = await getCookbookDetail(user.id, id);

  // Non-members get a 404 rather than a 403 — whether a cookbook exists is
  // itself something they shouldn't learn.
  if (!cookbook) notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link
        href="/dashboard"
        className="text-sm text-black/60 hover:underline dark:text-white/60"
      >
        ← Your library
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{cookbook.title}</h1>
          {cookbook.description ? (
            <p className="mt-2 text-black/70 dark:text-white/70">
              {cookbook.description}
            </p>
          ) : null}
        </div>

        {cookbook.canAddRecipes ? (
          <Link
            href={`/cookbooks/${cookbook.id}/recipes/new`}
            className="shrink-0 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            New recipe
          </Link>
        ) : null}
      </div>

      <RecipeList
        recipes={cookbook.recipes}
        canAddRecipes={cookbook.canAddRecipes}
        cookbookId={cookbook.id}
      />
    </div>
  );
}
