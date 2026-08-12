"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOnboardedUser } from "@/lib/user";
import { createRecipe } from "@/server/services/recipe.service";
import {
  parseRecipeForm,
  type CreateRecipeState,
} from "../recipe-form-data";

// Thin adapter: the only layer that knows about HTTP/FormData, auth, and
// redirects. The form's wire format lives in ../recipe-form-data so the edit
// action parses it the same way.

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

  const values = parseRecipeForm(formData);

  const result = await createRecipe(user.id, cookbookId, values);
  if (!result.ok) {
    // Echo the values back so a validation error never costs the user the
    // recipe they just typed.
    return { error: result.error.message, values };
  }

  revalidatePath(`/cookbooks/${cookbookId}`);
  redirect(`/cookbooks/${cookbookId}`);
}
