import { prisma } from "@/lib/prisma";

// The ONLY module that talks to Prisma for the AiImport table — the tally of
// how often each user has had Claude read a recipe for them.

export const aiImportRepository = {
  /**
   * Record one AI import for `userId`, unless they've already had `limit` of
   * them since `since`. Returns whether it was recorded.
   *
   * Counting and then writing would let a burst of simultaneous requests all
   * count the same total and all get through, so the two happen inside one
   * transaction holding a lock on this user: a second request waits for the
   * first to commit, then counts its row too. The lock is per user, so nobody
   * waits on anyone else, and it lets go when the transaction ends.
   */
  claim(userId: string, limit: number, since: Date) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ai-import:${userId}`}))`;

      const used = await tx.aiImport.count({
        where: { userId, createdAt: { gt: since } },
      });
      if (used >= limit) return false;

      await tx.aiImport.create({ data: { userId } });
      return true;
    });
  },
};
