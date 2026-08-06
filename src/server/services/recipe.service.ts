import { createRecipeSchema } from "@/lib/recipe";
import { cookbookRepository } from "@/server/repositories/cookbook.repository";
import { recipeRepository } from "@/server/repositories/recipe.repository";
import { canAddRecipes } from "@/server/permissions";
import { ok, err, type Result } from "@/server/result";

// Business logic for recipes. Framework-free, so it can be unit-tested by
// calling createRecipe(...) directly.

// Everything arrives as strings — this is what a form gives us.
export type RecipeIngredientInput = {
  name: string;
  quantity: string;
  unit: string;
  note: string;
};

export type CreateRecipeInput = {
  title: string;
  description: string;
  servings: string;
  prepTimeMinutes: string;
  cookTimeMinutes: string;
  ingredients: RecipeIngredientInput[];
  steps: string[];
};

export type RecipeError =
  | { kind: "validation"; message: string }
  | { kind: "forbidden"; message: string };

// A row the user added but never filled in shouldn't fail validation — it
// should just not exist. Only rows with no content at all are dropped; a row
// with a quantity but no name is a real mistake and must still be reported.
const isBlankIngredient = (i: RecipeIngredientInput) =>
  [i.name, i.quantity, i.unit, i.note].every((v) => v.trim() === "");

export async function createRecipe(
  userId: string,
  cookbookId: string,
  input: CreateRecipeInput,
): Promise<Result<{ id: string }, RecipeError>> {
  // Authorization before validation: a non-member shouldn't learn anything
  // about a cookbook, not even whether their recipe would have been valid.
  const membership = await cookbookRepository.findMembership(cookbookId, userId);
  if (!membership || !canAddRecipes(membership.role)) {
    return err({
      kind: "forbidden",
      message: "You don't have permission to add recipes to this cookbook.",
    });
  }

  const parsed = createRecipeSchema.safeParse({
    ...input,
    ingredients: input.ingredients.filter((i) => !isBlankIngredient(i)),
    steps: input.steps
      .filter((instruction) => instruction.trim() !== "")
      .map((instruction) => ({ instruction })),
  });
  if (!parsed.success) {
    const message =
      parsed.error.issues[0]?.message ?? "Please check your input.";
    return err({ kind: "validation", message });
  }

  const recipe = await recipeRepository.create({
    cookbookId,
    authorId: userId,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    servings: parsed.data.servings ?? null,
    prepTimeMinutes: parsed.data.prepTimeMinutes ?? null,
    cookTimeMinutes: parsed.data.cookTimeMinutes ?? null,
    ingredients: parsed.data.ingredients.map((i) => ({
      name: i.name,
      quantity: i.quantity ?? null,
      unit: i.unit ?? null,
      note: i.note ?? null,
    })),
    steps: parsed.data.steps.map((s) => s.instruction),
  });

  return ok({ id: recipe.id });
}
