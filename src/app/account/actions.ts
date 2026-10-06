"use server";

import { ensureUser } from "@/lib/user";
import { deleteOwnAccount } from "@/lib/account";
import {
  getAccountDeletionPreview,
  type AccountDeletionPreview,
} from "@/server/services/account.service";

// Deleting your own account, from the dialog in the user menu. Both actions act
// on whoever is signed in — nothing about whose account arrives from the
// client.

/** What deleting would do, loaded when the dialog opens. */
export async function loadAccountDeletionPreview(): Promise<AccountDeletionPreview | null> {
  const user = await ensureUser();
  return user ? getAccountDeletionPreview(user.id) : null;
}

export type DeleteAccountState = { error?: string; deleted?: boolean };

/** The order and its failure modes live in `deleteOwnAccount`; this words them. */
export async function deleteAccountAction(
  _prevState: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const user = await ensureUser();
  if (!user) return { error: "You're signed out already." };

  const result = await deleteOwnAccount(user, {
    keepRecipes: formData.get("recipes") !== "delete",
  });
  if (result.ok) return { deleted: true };

  return {
    error:
      result.failed === "data"
        ? // Say that nothing was deleted, rather than leave them guessing.
          "Something went wrong, and nothing was deleted. Please try again."
        : "Your cookbooks and recipes are deleted, but we couldn't close your sign-in. Please try again.",
  };
}
