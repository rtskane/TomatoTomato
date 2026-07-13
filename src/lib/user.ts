import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

/**
 * Lazily sync the currently signed-in Clerk user into our Postgres `User`
 * table and return the DB row. Call this from server components / actions /
 * route handlers that need the local user (e.g. to attach ownership).
 *
 * We use this instead of a Clerk webhook for now: no public URL / ngrok needed
 * in local dev. A deletion webhook can be added later for cleanup.
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

  const displayName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null;

  const avatarUrl = clerkUser.imageUrl || null;

  return prisma.user.upsert({
    where: { clerkId: clerkUser.id },
    update: { email, displayName, avatarUrl },
    create: { clerkId: clerkUser.id, email, displayName, avatarUrl },
  });
}
