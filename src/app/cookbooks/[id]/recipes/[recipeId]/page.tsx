import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireOnboardedUser } from "@/lib/user";
import { getRecipeDetail } from "@/server/services/recipe-detail.service";
import RecipeArticle from "./recipe-article";

type Params = { id: string; recipeId: string };

// Container: owns auth + data.
export default async function RecipePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id, recipeId } = await params;
  const user = await requireOnboardedUser();
  const recipe = await getRecipeDetail(user.id, id, recipeId);

  // Covers all three misses — no such recipe, wrong cookbook, or not a member
  // — with one 404, so the response never reveals which it was.
  if (!recipe) notFound();

  return (
    <>
      <div className="mx-auto max-w-3xl px-4 pt-8">
        <Link
          href={`/cookbooks/${recipe.cookbook.id}`}
          className="text-sm text-black/60 hover:underline dark:text-white/60"
        >
          ← {recipe.cookbook.title}
        </Link>
      </div>
      <RecipeArticle recipe={recipe} />
    </>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id, recipeId } = await params;
  const user = await requireOnboardedUser();
  const recipe = await getRecipeDetail(user.id, id, recipeId);

  if (!recipe) return { title: "Recipe not found" };

  return {
    title: `${recipe.title} — ${recipe.cookbook.title}`,
    description: recipe.description ?? undefined,
  };
}
