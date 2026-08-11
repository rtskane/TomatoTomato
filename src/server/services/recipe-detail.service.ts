import { cache } from "react";
import { recipeRepository } from "@/server/repositories/recipe.repository";
import { cookbookRepository } from "@/server/repositories/cookbook.repository";
import { canModifyRecipe } from "@/server/permissions";
import { displayName } from "@/lib/display-name";
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
  /** Whether this viewer may edit or delete it — author, or cookbook owner. */
  canModify: boolean;
  cookbook: { id: string; title: string };
  ingredients: RecipeDetailIngredient[];
  steps: { id: string; instruction: string }[];
};

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

  // The recipe query already proved membership — this second lookup is only to
  // learn *which* role, which decides whether the edit and delete controls
  // render. It's the same rule the write path enforces, so the buttons can't
  // offer something the action would refuse.
  const membership = await cookbookRepository.findMembership(cookbookId, userId);

  return {
    canModify: membership
      ? canModifyRecipe(membership.role, recipe.authorId === userId)
      : false,
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
    authorName: displayName(recipe.author),
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
