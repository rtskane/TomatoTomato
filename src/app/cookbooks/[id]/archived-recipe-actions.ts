"use server";

import { revalidatePath } from "next/cache";
import { requireOnboardedUser } from "@/lib/user";
import { deleteCoverImage } from "@/server/blob";
import {
  restoreRecipe,
  deleteRecipeForever,
} from "@/server/services/recipe.service";

// The way back for an archived recipe, and the way out for good. Both ids are
// bound server-side by the cookbook page; the service re-checks permission.

export type ArchivedRecipeState = { error?: string };

export async function restoreRecipeAction(
  cookbookId: string,
  recipeId: string,
  _prevState: ArchivedRecipeState,
  _formData: FormData,
): Promise<ArchivedRecipeState> {
  const user = await requireOnboardedUser();

  const result = await restoreRecipe(user.id, cookbookId, recipeId);
  if (!result.ok) return { error: result.error.message };

  revalidatePath(`/cookbooks/${cookbookId}`);
  return {};
}

export async function deleteRecipeForeverAction(
  cookbookId: string,
  recipeId: string,
  _prevState: ArchivedRecipeState,
  _formData: FormData,
): Promise<ArchivedRecipeState> {
  const user = await requireOnboardedUser();

  const result = await deleteRecipeForever(user.id, cookbookId, recipeId);
  if (!result.ok) return { error: result.error.message };

  await deleteCoverImage(result.value.orphanedImage);

  revalidatePath(`/cookbooks/${cookbookId}`);
  return {};
}
