"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { ensureUser } from "@/lib/user";
import { removeAccountData } from "@/lib/account";
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

/**
 * Our data first, then the Clerk user. In that order because only we know
 * their answer about recipes: if the Clerk delete came first and ours then
 * failed, the webhook would clean up with its default instead of their choice.
 * The other way round, a failed Clerk delete leaves them signed in to an empty
 * account, and pressing the button again finishes the job.
 */
export async function deleteAccountAction(
  _prevState: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const user = await ensureUser();
  if (!user) return { error: "You're signed out already." };

  try {
    await removeAccountData(user.id, {
      keepRecipes: formData.get("recipes") !== "delete",
    });
  } catch (error) {
    // One transaction, so a failure means nothing was deleted — say that,
    // rather than leave them guessing on the error page.
    console.error("[account] delete failed", error);
    return { error: "Something went wrong, and nothing was deleted. Please try again." };
  }

  try {
    await (await clerkClient()).users.deleteUser(user.clerkId);
  } catch (error) {
    if (!(isClerkAPIResponseError(error) && error.status === 404)) {
      console.error("[account] Clerk user delete failed", error);
      return {
        error:
          "Your cookbooks and recipes are deleted, but we couldn't close your sign-in. Please try again.",
      };
    }
  }

  return { deleted: true };
}
