"use server";

import { requireOnboardedUser } from "@/lib/user";
import { cookbookRepository } from "@/server/repositories/cookbook.repository";
import { canAddRecipes } from "@/server/permissions";
import {
  importFromText,
  importFromUrl,
} from "@/server/services/recipe-import.service";
import type { CreateRecipeValues } from "../recipe-form-data";

// Adapters for the two importers that need a server: one to read a link, one to
// make sense of pasted text.
//
// Neither writes anything. Both hand back `CreateRecipeValues`, which the page
// puts into the ordinary recipe form for the author to check — so the save path
// is still the one every recipe has always gone through.

export type ImportState = {
  error?: string;
  values?: CreateRecipeValues;
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
 * Both actions are gated on being able to add recipes to *this* cookbook, which
 * is stricter than it looks like it needs to be: importing doesn't write, so a
 * membership check might seem like ceremony.
 *
 * It isn't. `importFromUrl` makes our server fetch a URL of the caller's
 * choosing, and an endpoint that does that for any signed-in user is a fetching
 * service we host for strangers. Tying it to a cookbook they can already write
 * to keeps it in proportion to what it's for.
 */
async function requireImporter(cookbookId: string) {
  const user = await requireOnboardedUser();
  const membership = await cookbookRepository.findMembership(
    cookbookId,
    user.id,
  );

  return membership && canAddRecipes(membership.role);
}

export async function importFromTextAction(
  cookbookId: string,
  _prevState: ImportState,
  formData: FormData,
): Promise<ImportState> {
  if (!(await requireImporter(cookbookId))) {
    return {
      error: "You don't have permission to add recipes here.",
      submitted: String(formData.get("text") ?? ""),
    };
  }

  const text = String(formData.get("text") ?? "");
  const result = importFromText(text);

  return result.ok
    ? { values: result.value }
    : { error: result.error.message, submitted: text };
}

export async function importFromUrlAction(
  cookbookId: string,
  _prevState: ImportState,
  formData: FormData,
): Promise<ImportState> {
  if (!(await requireImporter(cookbookId))) {
    return {
      error: "You don't have permission to add recipes here.",
      submitted: String(formData.get("url") ?? ""),
    };
  }

  const url = String(formData.get("url") ?? "");
  const result = await importFromUrl(url);

  return result.ok
    ? { values: result.value }
    : { error: result.error.message, submitted: url };
}
