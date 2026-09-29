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
