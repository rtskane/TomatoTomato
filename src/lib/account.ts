import { clerkClient } from "@clerk/nextjs/server";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { deleteAccount } from "@/server/services/account.service";
import { deleteImages } from "@/server/blob";

// The framework half of deleting an account: the service decides and deletes
// rows; this removes the files they pointed at and talks to Clerk.

/**
 * Delete an account's data and the images it leaves orphaned. The images go
 * after the database write, best-effort, as everywhere else — a failed file
 * delete must not undo a deletion that already happened.
 */
export async function removeAccountData(
  userId: string,
  { keepRecipes }: { keepRecipes: boolean },
): Promise<void> {
  const { orphanedImages } = await deleteAccount(userId, { keepRecipes });
  await deleteImages(orphanedImages);
}

/**
 * Which half failed, when deleting your own account doesn't finish: `data`
 * means nothing was deleted (one transaction); `sign-in` means everything of
 * ours is gone but the Clerk user remains, and trying again finishes the job.
 */
export type DeleteOwnAccountResult =
  | { ok: true }
  | { ok: false; failed: "data" | "sign-in" };

/**
 * Delete the signed-in person's account at their request — from the web
 * dialog or the phone app, which must not differ on any of this.
 *
 * Our data first, then the Clerk user. In that order because only we know
 * their answer about recipes: if the Clerk delete came first and ours then
 * failed, the webhook would clean up with its default instead of their choice.
 * The other way round, a failed Clerk delete leaves them signed in to an empty
 * account, and asking again finishes the job.
 */
export async function deleteOwnAccount(
  user: { id: string; clerkId: string },
  { keepRecipes }: { keepRecipes: boolean },
): Promise<DeleteOwnAccountResult> {
  try {
    await removeAccountData(user.id, { keepRecipes });
  } catch (error) {
    console.error("[account] delete failed", error);
    return { ok: false, failed: "data" };
  }

  try {
    await (await clerkClient()).users.deleteUser(user.clerkId);
  } catch (error) {
    // Already gone counts as done.
    if (!(isClerkAPIResponseError(error) && error.status === 404)) {
      console.error("[account] Clerk user delete failed", error);
      return { ok: false, failed: "sign-in" };
    }
  }

  return { ok: true };
}

/**
 * Whether Clerk no longer knows this user — deleted, so any row we still hold
 * for them is left over. Anything other than a clean 404 counts as "still
 * there": acting on a local row is only safe when Clerk has said it's gone.
 */
export async function clerkUserIsGone(clerkId: string): Promise<boolean> {
  try {
    await (await clerkClient()).users.getUser(clerkId);
    return false;
  } catch (error) {
    return isClerkAPIResponseError(error) && error.status === 404;
  }
}
