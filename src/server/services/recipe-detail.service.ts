import { cache } from "react";
import { recipeRepository } from "@/server/repositories/recipe.repository";
import { cookbookRepository } from "@/server/repositories/cookbook.repository";
import { canModifyRecipe } from "@/server/permissions";
import { authorName } from "@/lib/display-name";
import { totalMinutes } from "@/lib/recipe-display";

// Read side for a single recipe. Kept apart from recipe.service.ts, which owns
// the write path and its permission checks.

export type RecipeDetailIngredient = {
  id: string;
  name: string;
  /** The stored number, not text: cooking mode scales it before printing, and
   * the edit form needs it exact. `formatQuantity` is what prints it. */
  quantity: number | null;
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
  /** A photo of the dish, or null. */
  coverImageUrl: string | null;
  authorName: string;
  /** Whether this viewer may edit or delete it — author, or cookbook owner. */
  canModify: boolean;
  cookbook: { id: string; title: string };
  ingredients: RecipeDetailIngredient[];
  steps: { id: string; instruction: string }[];
};

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
    coverImageUrl: recipe.coverImageUrl,
    authorName: authorName(recipe.author),
    cookbook: recipe.cookbook,
    ingredients: recipe.ingredients.map((i) => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity,
      unit: i.unit ?? "",
      note: i.note,
    })),
    steps: recipe.steps.map((s) => ({ id: s.id, instruction: s.instruction })),
  };
});
