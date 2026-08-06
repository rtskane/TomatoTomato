import { cache } from "react";
import { recipeRepository } from "@/server/repositories/recipe.repository";
import { totalMinutes } from "@/lib/recipe-display";

// Read side for a single recipe. Kept apart from recipe.service.ts, which owns
// the write path and its permission checks.

export type RecipeDetailIngredient = {
  id: string;
  name: string;
  /** Already a string — the view never formats numbers itself. */
  quantity: string;
  unit: string;
  note: string | null;
};

export type RecipeDetail = {
  id: string;
  title: string;
  description: string | null;
  servings: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  totalTimeMinutes: number | null;
  authorName: string;
  cookbook: { id: string; title: string };
  ingredients: RecipeDetailIngredient[];
  steps: { id: string; instruction: string }[];
};

// Prefer the handle, fall back to a real name, then to something neutral —
// username is nullable until onboarding completes.
function displayAuthor(author: {
  username: string | null;
  firstName: string | null;
  lastName: string | null;
}): string {
  if (author.username) return author.username;
  const name = [author.firstName, author.lastName].filter(Boolean).join(" ");
  return name || "Unknown";
}

/**
 * Quantities are stored as Float, so 2 arrives as `2` and half a teaspoon as
 * `0.5`. Rendering the raw number would print "2" fine but also "0.5" — which
 * is right — while `toFixed` would turn 2 into "2.00". Stripping the trailing
 * zeros keeps both readable.
 */
function formatQuantity(quantity: number | null): string {
  if (quantity === null) return "";
  return String(quantity);
}

/**
 * One recipe, or `null` when the user can't see it — which the caller should
 * surface as a 404, not a 403.
 *
 * Cached per request so the page and `generateMetadata` share one query.
 */
export const getRecipeDetail = cache(async function getRecipeDetail(
  userId: string,
  cookbookId: string,
  recipeId: string,
): Promise<RecipeDetail | null> {
  const recipe = await recipeRepository.findDetailForUser(
    cookbookId,
    recipeId,
    userId,
  );
  if (!recipe) return null;

  return {
    id: recipe.id,
    title: recipe.title,
    description: recipe.description,
    servings: recipe.servings,
    prepTimeMinutes: recipe.prepTimeMinutes,
    cookTimeMinutes: recipe.cookTimeMinutes,
    totalTimeMinutes: totalMinutes(
      recipe.prepTimeMinutes,
      recipe.cookTimeMinutes,
    ),
    authorName: displayAuthor(recipe.author),
    cookbook: recipe.cookbook,
    ingredients: recipe.ingredients.map((i) => ({
      id: i.id,
      name: i.name,
      quantity: formatQuantity(i.quantity),
      unit: i.unit ?? "",
      note: i.note,
    })),
    steps: recipe.steps.map((s) => ({ id: s.id, instruction: s.instruction })),
  };
});
