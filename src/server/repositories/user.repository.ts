import { prisma } from "@/lib/prisma";

// The ONLY module that talks to Prisma for the User table. Everything above
// this layer speaks in these method calls and domain errors, never in Prisma
// queries — so the persistence choice stays swappable and mockable.

/** Raised by `setProfile` when the chosen username is already taken. */
export class UsernameTakenError extends Error {
  constructor() {
    super("Username already taken");
    this.name = "UsernameTakenError";
  }
}

type ClerkSync = {
  clerkId: string;
  email: string;
  avatarUrl: string | null;
};

type ProfileInput = {
  clerkId: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
};

// Prisma's unique-constraint violation code.
function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === "P2002"
  );
}

export const userRepository = {
  findByClerkId(clerkId: string) {
    return prisma.user.findUnique({ where: { clerkId } });
  },

  /**
   * Resolve many usernames at once, for the batch invite form.
   *
   * One query rather than N: the caller matches the results back up by
   * username and treats anything missing as "no such user". Usernames are
   * stored already-normalized (lowercased), so the caller must normalize
   * before calling — `usernameSchema` does that.
   */
  findManyByUsernames(usernames: string[]) {
    return prisma.user.findMany({
      where: { username: { in: usernames } },
      select: { id: true, username: true },
    });
  },

  /** Sync only Clerk-owned fields; never touches onboarding-owned profile. */
  upsertFromClerk({ clerkId, email, avatarUrl }: ClerkSync) {
    return prisma.user.upsert({
      where: { clerkId },
      update: { email, avatarUrl },
      create: { clerkId, email, avatarUrl },
    });
  },

  /** Claim a username + set names. Throws {@link UsernameTakenError} on clash. */
  async setProfile({ clerkId, username, firstName, lastName }: ProfileInput) {
    try {
      return await prisma.user.update({
        where: { clerkId },
        data: { username, firstName, lastName },
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new UsernameTakenError();
      throw e;
    }
  },
};
