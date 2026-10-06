import { cache } from "react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { redirect } from "next/navigation";
import {
  isUniqueViolation,
  userRepository,
} from "@/server/repositories/user.repository";
import { clerkUserIsGone, removeAccountData } from "@/lib/account";

/**
 * Return the local Postgres `User` row for the signed-in visitor, creating it
 * on first sight. Call this from server components / actions / route handlers
 * that need the local user (e.g. to attach ownership).
 *
 * Returns null if no one is signed in.
 *
 * Wrapped in `React.cache` so a single request that also calls
 * `requireOnboardedUser` (e.g. page + `generateMetadata`) only hits Postgres
 * once.
 *
 * ## Why it's shaped this way
 *
 * `auth()` verifies the session JWT locally — no network. `currentUser()` also
 * calls `auth()`, but then makes an outbound HTTPS request to Clerk's Backend
 * API for the full profile. Calling it here put a cross-internet round trip on
 * *every view of every protected page*, ahead of every query, when all the hot
 * path needed was an id we already had in the token.
 *
 * So: read the id from the token, look the row up directly, and only talk to
 * Clerk when there's no row yet — which happens once per user, ever.
 */
/**
 * How long a locally-stored copy of the Clerk-owned profile fields (email,
 * avatar) is trusted before we refresh it.
 *
 * Note this is measured against `User.updatedAt`, which Prisma bumps on *any*
 * write to the row — so an unrelated write (onboarding setting a username)
 * also resets the clock. That only ever delays a refresh, never skips one
 * permanently, and it avoids a dedicated column. Add `profileSyncedAt` if this
 * ever needs to be exact.
 */
const PROFILE_TTL_MS = 60 * 60 * 1000; // 1 hour

export const ensureUser = cache(async () => {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const existing = await userRepository.findByClerkId(clerkId);

  // First sight of this user: we need the profile from Clerk.
  if (!existing) return syncFromClerk();

  const age = Date.now() - existing.updatedAt.getTime();
  if (age < PROFILE_TTL_MS) return existing;

  // Stale. Refresh the Clerk-owned fields so a changed email or avatar shows up
  // rather than being frozen at whatever it was on sign-up.
  //
  // This blocks the request, which is deliberate: `after()` would let it run
  // past the response, but request APIs (which `currentUser` reads internally)
  // throw inside an `after` callback in a Server Component. So the cost is one
  // Clerk round trip per user per hour, on a single page view — not per view.
  try {
    return (await syncFromClerk()) ?? existing;
  } catch {
    // Clerk unreachable. A slightly stale avatar beats a failed page render,
    // and the next request after the outage will try again.
    return existing;
  }
});

/**
 * Fetch the Clerk profile and write the Clerk-owned fields to the local row.
 * Used both on first sight of a user and to refresh a stale copy.
 *
 * Only email/avatar are written; username/firstName/lastName belong to
 * onboarding and are set via the onboarding service.
 */
async function syncFromClerk() {
  const clerkUser = await currentProfile();
  if (!clerkUser) return null;

  const email =
    clerkUser.emailAddresses.find(
      (e) => e.id === clerkUser.primaryEmailAddressId,
    )?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress ??
    null;

  const profile = {
    clerkId: clerkUser.id,
    email,
    avatarUrl: clerkUser.imageUrl || null,
  };

  // Still an upsert, not a create: two concurrent first requests would
  // otherwise race and one would hit the clerkId unique constraint.
  try {
    return await userRepository.upsertFromClerk(profile);
  } catch (error) {
    if (!email || !isUniqueViolation(error)) throw error;
    return claimEmailFromDeletedAccount(profile, email, error);
  }
}

/**
 * The signed-in person's Clerk profile, or null when Clerk says they no longer
 * exist. That happens for up to a minute after an account is deleted: the
 * session token already issued stays valid until it expires, so a request can
 * arrive signed in as someone who's gone. Treating it as signed out sends a
 * page to sign-in and the API to a 401, rather than both to a 500. The phone
 * app holds on to its token, which makes this the normal case there.
 */
async function currentProfile() {
  try {
    return await currentUser();
  } catch (error) {
    if (isClerkAPIResponseError(error) && error.status === 404) return null;
    throw error;
  }
}

/**
 * Another row already holds this email. Two ways that happens:
 *
 * - A race: two first requests for the same person, and the other one won.
 *   The row is theirs already; use it.
 * - A leftover: someone deleted their Clerk account without our hearing about
 *   it (the webhook missed, or it predates the webhook), then signed up again
 *   with the same email. Clerk gave them a new id, so the old row blocks the
 *   new one, and every page they opened used to fail.
 *
 * A leftover is cleared the way the webhook would have — their shared recipes
 * kept, unattributed — but only once Clerk confirms its owner is gone. A row
 * whose Clerk user still exists is somebody's live account, and the error
 * stands.
 */
async function claimEmailFromDeletedAccount(
  profile: Parameters<typeof userRepository.upsertFromClerk>[0],
  email: string,
  conflict: unknown,
) {
  const holder = await userRepository.findByEmail(email);
  if (holder?.clerkId === profile.clerkId) return holder;
  if (!holder || !(await clerkUserIsGone(holder.clerkId))) throw conflict;

  await removeAccountData(holder.id, { keepRecipes: true });
  return userRepository.upsertFromClerk(profile);
}

/**
 * Gate for protected pages: ensures the visitor is signed in AND has finished
 * onboarding (has a username). Redirects otherwise, so the returned user is
 * guaranteed non-null with a username set.
 *
 * Cached per request so page + metadata (or nested layouts) share one lookup.
 */
export const requireOnboardedUser = cache(async () => {
  const user = await ensureUser();
  if (!user) redirect("/sign-in");
  if (!user.username) redirect("/onboarding");
  return user;
});
