import { createRecipeSchema } from "@/lib/recipe";
import { cookbookRepository } from "@/server/repositories/cookbook.repository";
import { recipeRepository } from "@/server/repositories/recipe.repository";
import { canAddRecipes, canModifyRecipe } from "@/server/permissions";
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
    ...toRecipeFields(parsed.data),
  });

  return ok({ id: recipe.id });
}

// The validated shape and the repository's shape differ only in how they spell
// "absent" — zod gives `undefined`, the database wants `null`. Shared by create
// and update so the two can't drift.
function toRecipeFields(data: ParsedRecipe) {
  return {
    title: data.title,
    description: data.description ?? null,
    servings: data.servings ?? null,
    prepTimeMinutes: data.prepTimeMinutes ?? null,
    cookTimeMinutes: data.cookTimeMinutes ?? null,
    ingredients: data.ingredients.map((i) => ({
      name: i.name,
      quantity: i.quantity ?? null,
      unit: i.unit ?? null,
      note: i.note ?? null,
    })),
    steps: data.steps.map((s) => s.instruction),
  };
}

type ParsedRecipe = ReturnType<typeof createRecipeSchema.parse>;

/**
 * Resolve whether this user may change this recipe, and hand back the recipe if
 * so. Shared by editing and deleting — they carry the same rule.
 *
 * Everything unauthorized comes back as the same `forbidden`, and a recipe that
 * doesn't exist is indistinguishable from one in a cookbook the user can't see:
 * both paths return before revealing anything about it.
 */
async function requireModifiableRecipe(
  userId: string,
  cookbookId: string,
  recipeId: string,
): Promise<Result<{ id: string; title: string }, RecipeError>> {
  const forbidden = err({
    kind: "forbidden" as const,
    message: "You don't have permission to change this recipe.",
  });

  const membership = await cookbookRepository.findMembership(cookbookId, userId);
  if (!membership) return forbidden;

  const recipe = await recipeRepository.findForPermissionCheck(
    cookbookId,
    recipeId,
  );
  if (!recipe) return forbidden;

  if (!canModifyRecipe(membership.role, recipe.authorId === userId)) {
    return forbidden;
  }

  return ok({ id: recipe.id, title: recipe.title });
}

/**
 * Edit an existing recipe.
 *
 * The recipe keeps its author: `authorId` records who wrote it, and an owner
 * fixing a typo doesn't make the recipe theirs.
 */
export async function updateRecipe(
  userId: string,
  cookbookId: string,
  recipeId: string,
  input: CreateRecipeInput,
): Promise<Result<{ id: string }, RecipeError>> {
  const allowed = await requireModifiableRecipe(userId, cookbookId, recipeId);
  if (!allowed.ok) return allowed;

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

  await recipeRepository.update({
    recipeId: allowed.value.id,
    ...toRecipeFields(parsed.data),
  });

  return ok({ id: allowed.value.id });
}

/** Delete a recipe. Ingredients and steps cascade; nothing is recoverable. */
export async function deleteRecipe(
  userId: string,
  cookbookId: string,
  recipeId: string,
): Promise<Result<{ title: string }, RecipeError>> {
  const allowed = await requireModifiableRecipe(userId, cookbookId, recipeId);
  if (!allowed.ok) return allowed;

  await recipeRepository.delete(allowed.value.id);
  return ok({ title: allowed.value.title });
}
