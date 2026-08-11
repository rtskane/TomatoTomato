import type { RecipeIngredientInput } from "@/server/services/recipe.service";

// The wire format of the recipe form, shared by the create and edit actions.
//
// Deliberately NOT in either `actions.ts`: those carry the "use server"
// directive, and every export of such a file has to be an async function — so a
// plain parser or type can't live there. Keeping it here lets both actions
// parse identically, which is what stops the two forms drifting apart.

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

export function parseRecipeForm(formData: FormData): CreateRecipeValues {
  return {
    title: str(formData, "title"),
    description: str(formData, "description"),
    servings: str(formData, "servings"),
    prepTimeMinutes: str(formData, "prepTimeMinutes"),
    cookTimeMinutes: str(formData, "cookTimeMinutes"),
    ingredients: parseIngredients(formData),
    steps: all(formData, "stepInstruction"),
  };
}
