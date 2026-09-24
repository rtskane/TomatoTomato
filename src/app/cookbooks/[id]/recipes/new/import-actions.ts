"use server";

import type { RecipeSource } from "@/lib/recipe";
import { requireOnboardedUser } from "@/lib/user";
import {
  importFromText,
  importFromUrl,
} from "@/server/services/recipe-import.service";
import { importFromPhoto } from "@/server/services/recipe-photo-import.service";
import type { CreateRecipeValues } from "../recipe-form-data";

// Adapters for the importers that need a server: one to read a link, one to
// make sense of pasted text, one to ask AI to read a photo. Thin on purpose,
// like `createRecipeAction` — the permission check and everything else lives
// in the service.
//
// None of them writes anything. Each hands back `CreateRecipeValues`, which the
// page puts into the ordinary recipe form for the author to check — so the save
// path is still the one every recipe has always gone through — plus which
// importer it was, for that save to record.

export type ImportState = {
  error?: string;
  values?: CreateRecipeValues;
  /** Which importer produced `values`, for the saved recipe to record. */
  source?: RecipeSource;
  /**
   * What the user submitted, handed straight back.
   *
   * React resets a form once its action resolves, so an uncontrolled field
   * empties itself on the way back — and an import that failed would take the
   * user's pasted recipe with it, which is the one moment they most need it
   * still to be there. Echoing it lets the field re-seed from `defaultValue`,
   * the same way `CreateRecipeState.values` already rescues the recipe form.
   */
  submitted?: string;
};

/**
 * `cookbookId` is bound server-side by the page, not submitted by the form, so a
 * crafted POST can't point an import at somebody else's cookbook.
 */
export async function importFromTextAction(
  cookbookId: string,
  _prevState: ImportState,
  formData: FormData,
): Promise<ImportState> {
  // Server Actions are reachable via direct POST — re-check auth here.
  const user = await requireOnboardedUser();

  const text = String(formData.get("text") ?? "");
  const result = await importFromText(user.id, cookbookId, text);

  return result.ok
    ? { values: result.value, source: "PASTE" }
    : { error: result.error.message, submitted: text };
}

export async function importFromUrlAction(
  cookbookId: string,
  _prevState: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const user = await requireOnboardedUser();

  const url = String(formData.get("url") ?? "");
  const result = await importFromUrl(user.id, cookbookId, url);

  return result.ok
    ? { values: result.value.values, source: result.value.source }
    : { error: result.error.message, submitted: url };
}

export async function importFromPhotoAction(
  cookbookId: string,
  _prevState: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const user = await requireOnboardedUser();

  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    return { error: "Choose a photo first." };
  }

  const result = await importFromPhoto(user.id, cookbookId, photo);
  return result.ok
    ? { values: result.value, source: "PHOTO" }
    : { error: result.error.message };
}
