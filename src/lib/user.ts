import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { userRepository } from "@/server/repositories/user.repository";

/**
 * Lazily sync the currently signed-in Clerk user into our Postgres `User`
 * table and return the DB row. Call this from server components / actions /
 * route handlers that need the local user (e.g. to attach ownership).
 *
 * We use this instead of a Clerk webhook for now: no public URL / ngrok needed
 * in local dev. Only Clerk-owned fields are synced — username/firstName/
 * lastName are owned by onboarding and set via the onboarding service.
 *
 * Returns null if no one is signed in.
 */
export async function ensureUser() {
  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const email =
    clerkUser.emailAddresses.find(
      (e) => e.id === clerkUser.primaryEmailAddressId,
    )?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress ??
    "";

  const avatarUrl = clerkUser.imageUrl || null;

  return userRepository.upsertFromClerk({
    clerkId: clerkUser.id,
    email,
    avatarUrl,
  });
}

/**
 * Gate for protected pages: ensures the visitor is signed in AND has finished
 * onboarding (has a username). Redirects otherwise, so the returned user is
 * guaranteed non-null with a username set.
 */
export async function requireOnboardedUser() {
  const user = await ensureUser();
  if (!user) redirect("/sign-in");
  if (!user.username) redirect("/onboarding");
  return user;
}
