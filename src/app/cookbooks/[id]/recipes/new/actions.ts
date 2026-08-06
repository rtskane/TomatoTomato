"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOnboardedUser } from "@/lib/user";
import {
  createRecipe,
  type RecipeIngredientInput,
} from "@/server/services/recipe.service";

// Thin adapter: the only layer that knows about HTTP/FormData, auth, and
// redirects.

export type CreateRecipeValues = {
  title: string;
  description: string;
  servings: string;
  prepTimeMinutes: string;
  cookTimeMinutes: string;
  ingredients: RecipeIngredientInput[];
  steps: string[];
};

export type CreateRecipeState = {
  error?: string;
  values?: CreateRecipeValues;
};

const str = (formData: FormData, key: string) =>
  String(formData.get(key) ?? "");

const all = (formData: FormData, key: string) =>
  formData.getAll(key).map((v) => String(v));

/**
 * Rebuild the ordered ingredient rows from repeated form fields.
 *
 * Each row renders all four inputs, so the browser submits four parallel lists
 * in DOM order — zipping them by index reconstructs the rows, and that index is
 * the order the user arranged them in.
 */
function parseIngredients(formData: FormData): RecipeIngredientInput[] {
  const names = all(formData, "ingredientName");
  const quantities = all(formData, "ingredientQuantity");
  const units = all(formData, "ingredientUnit");
  const notes = all(formData, "ingredientNote");

  return names.map((name, i) => ({
    name,
    quantity: quantities[i] ?? "",
    unit: units[i] ?? "",
    note: notes[i] ?? "",
  }));
}

/**
 * `cookbookId` is bound server-side by the page, not submitted as a hidden
 * field — so a crafted POST can't retarget the recipe at another cookbook.
 * (The service checks membership regardless; this just removes the question.)
 */
export async function createRecipeAction(
  cookbookId: string,
  _prevState: CreateRecipeState,
  formData: FormData,
): Promise<CreateRecipeState> {
  // Server Actions are reachable via direct POST — re-check auth here.
  const user = await requireOnboardedUser();

  const values: CreateRecipeValues = {
    title: str(formData, "title"),
    description: str(formData, "description"),
    servings: str(formData, "servings"),
    prepTimeMinutes: str(formData, "prepTimeMinutes"),
    cookTimeMinutes: str(formData, "cookTimeMinutes"),
    ingredients: parseIngredients(formData),
    steps: all(formData, "stepInstruction"),
  };

  const result = await createRecipe(user.id, cookbookId, values);
  if (!result.ok) {
    // Echo the values back so a validation error never costs the user the
    // recipe they just typed.
    return { error: result.error.message, values };
  }

  revalidatePath(`/cookbooks/${cookbookId}`);
  redirect(`/cookbooks/${cookbookId}`);
}
