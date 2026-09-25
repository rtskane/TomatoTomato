import { createRecipeSchema, type RecipeSource } from "@/lib/recipe";
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
  coverImageUrl: string;
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

/**
 * `source` is which way in the author used — null when it isn't known. It
 * never fails a save: it's there to learn from, not to check.
 */
export async function createRecipe(
  userId: string,
  cookbookId: string,
  input: CreateRecipeInput,
  source: RecipeSource | null = null,
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
    source,
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
    coverImageUrl: data.coverImageUrl ?? null,
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
 * Which state the recipe has to be in for the operation: editing and archiving
 * act on a live recipe, restoring and deleting for good on an archived one.
 */
type RecipeState = "live" | "archived";

/**
 * Resolve whether this user may change this recipe, and hand back the recipe if
 * so. Shared by editing, archiving, restoring and deleting — they carry the same
 * rule.
 *
 * Everything unauthorized comes back as the same `forbidden`, and a recipe that
 * doesn't exist is indistinguishable from one in a cookbook the user can't see:
 * both paths return before revealing anything about it. A recipe in the wrong
 * state — editing an archived one, restoring a live one — is refused the same
 * way; there's nothing more useful to say about a stale form.
 */
async function requireModifiableRecipe(
  userId: string,
  cookbookId: string,
  recipeId: string,
  state: RecipeState,
): Promise<
  Result<{ id: string; title: string; coverImageUrl: string | null }, RecipeError>
> {
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
  if (Boolean(recipe.archivedAt) !== (state === "archived")) return forbidden;

  if (!canModifyRecipe(membership.role, recipe.authorId === userId)) {
    return forbidden;
  }

  return ok({
    id: recipe.id,
    title: recipe.title,
    coverImageUrl: recipe.coverImageUrl,
  });
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
  const allowed = await requireModifiableRecipe(
    userId,
    cookbookId,
    recipeId,
    "live",
  );
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

/**
 * Take a recipe out of the cookbook without destroying it. It leaves the list
 * for every member, and whoever may modify it can restore it — or delete it for
 * good — from the cookbook's archived list.
 */
export async function archiveRecipe(
  userId: string,
  cookbookId: string,
  recipeId: string,
): Promise<Result<{ title: string }, RecipeError>> {
  const allowed = await requireModifiableRecipe(
    userId,
    cookbookId,
    recipeId,
    "live",
  );
  if (!allowed.ok) return allowed;

  await recipeRepository.archive(allowed.value.id);
  return ok({ title: allowed.value.title });
}

export async function restoreRecipe(
  userId: string,
  cookbookId: string,
  recipeId: string,
): Promise<Result<{ title: string }, RecipeError>> {
  const allowed = await requireModifiableRecipe(
    userId,
    cookbookId,
    recipeId,
    "archived",
  );
  if (!allowed.ok) return allowed;

  await recipeRepository.restore(allowed.value.id);
  return ok({ title: allowed.value.title });
}

/**
 * Delete an archived recipe for good. Ingredients and steps cascade; nothing is
 * recoverable. `orphanedImage` is its photo, for the caller to remove from blob
 * storage.
 */
export async function deleteRecipeForever(
  userId: string,
  cookbookId: string,
  recipeId: string,
): Promise<Result<{ orphanedImage: string | null }, RecipeError>> {
  const allowed = await requireModifiableRecipe(
    userId,
    cookbookId,
    recipeId,
    "archived",
  );
  if (!allowed.ok) return allowed;

  await recipeRepository.deleteArchived(allowed.value.id);
  return ok({ orphanedImage: allowed.value.coverImageUrl });
}

export type ArchivedRecipe = { id: string; title: string };

/**
 * The archived recipes this user could bring back: all of them for the owner,
 * an editor's own, and none for a viewer. Empty for a non-member.
 */
export async function listArchivedRecipes(
  userId: string,
  cookbookId: string,
): Promise<ArchivedRecipe[]> {
  const membership = await cookbookRepository.findMembership(cookbookId, userId);
  if (!membership) return [];

  const rows = await recipeRepository.listArchived(cookbookId);
  return rows
    .filter((row) => canModifyRecipe(membership.role, row.authorId === userId))
    .map((row) => ({ id: row.id, title: row.title }));
}
