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
  email: string | null;
  avatarUrl: string | null;
};

type ProfileInput = {
  clerkId: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
};

// Prisma's unique-constraint violation code.
export function isUniqueViolation(e: unknown): boolean {
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

  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  /**
   * Sync only Clerk-owned fields; never touches onboarding-owned profile.
   * Throws Prisma's unique violation if another row holds the email — see
   * `syncFromClerk` for when that happens and what's done about it.
   */
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
