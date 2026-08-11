"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOnboardedUser } from "@/lib/user";
import { updateRecipe, deleteRecipe } from "@/server/services/recipe.service";
import {
  parseRecipeForm,
  type CreateRecipeState,
} from "../../recipe-form-data";

// Thin adapter: the only layer that knows about HTTP/FormData, auth, and
// redirects. Both ids are bound server-side by the page rather than submitted,
// so a crafted POST can't retarget another cookbook's recipe. (The service
// re-checks permission regardless; this removes the question.)

export async function updateRecipeAction(
  cookbookId: string,
  recipeId: string,
  _prevState: CreateRecipeState,
  formData: FormData,
): Promise<CreateRecipeState> {
  // Server Actions are reachable via direct POST — re-check auth here.
  const user = await requireOnboardedUser();

  const values = parseRecipeForm(formData);

  const result = await updateRecipe(user.id, cookbookId, recipeId, values);
  if (!result.ok) {
    // Echo the values back so a validation error never costs the user the
    // edits they just made.
    return { error: result.error.message, values };
  }

  revalidatePath(`/cookbooks/${cookbookId}`);
  revalidatePath(`/cookbooks/${cookbookId}/recipes/${recipeId}`);
  redirect(`/cookbooks/${cookbookId}/recipes/${recipeId}`);
}

export type DeleteRecipeState = { error?: string };

export async function deleteRecipeAction(
  cookbookId: string,
  recipeId: string,
  _prevState: DeleteRecipeState,
  _formData: FormData,
): Promise<DeleteRecipeState> {
  const user = await requireOnboardedUser();

  const result = await deleteRecipe(user.id, cookbookId, recipeId);
  if (!result.ok) return { error: result.error.message };

  // The recipe's own page is gone, so send them back to the cookbook.
  revalidatePath(`/cookbooks/${cookbookId}`);
  redirect(`/cookbooks/${cookbookId}`);
}
