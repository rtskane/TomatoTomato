import { prisma } from "@/lib/prisma";
import { CookbookRole } from "@/generated/prisma/enums";

// The ONLY module that deletes a whole account. It reads everything the account
// touches and then removes it in one transaction; deciding *what* happens to
// each thing is account.service's job, so the rules stay testable without a
// database.

/** A cookbook handed to another member when its owner leaves. */
export type Transfer = { cookbookId: string; heirId: string };

export type AccountDeletion = {
  userId: string;
  transfers: Transfer[];
  /** Owned cookbooks nobody else is in — deleted with everything inside. */
  deleteCookbookIds: string[];
  /** Their recipes in cookbooks that survive, when they chose not to keep them. */
  deleteRecipeIds: string[];
};

export const accountRepository = {
  /**
   * Everything an account's deletion has to decide about: the cookbooks it
   * owns (with who else is in them, earliest first, and every image inside),
   * and every recipe it wrote anywhere. Archived ones included — deleting an
   * account can't leave archived rows pointing at nobody.
   */
  findFootprint(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        ownedCookbooks: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            coverImageUrl: true,
            members: {
              where: { userId: { not: userId } },
              orderBy: { createdAt: "asc" },
              select: { userId: true, role: true },
            },
            recipes: { select: { coverImageUrl: true } },
          },
        },
        recipes: { select: { id: true, cookbookId: true, coverImageUrl: true } },
      },
    });
  },

  /**
   * Carry out a deletion in one transaction, so a failure part-way leaves the
   * account whole rather than half-gone.
   *
   * The order matters. Ownership moves first, because `Cookbook.owner` is
   * `onDelete: Restrict` and the user row can't go while it owns anything. The
   * user row goes last: its delete cascades to memberships, links it made and
   * AI import records, and sets `authorId` to null on the recipes left behind.
   */
  deleteAccount({
    userId,
    transfers,
    deleteCookbookIds,
    deleteRecipeIds,
  }: AccountDeletion) {
    return prisma.$transaction([
      ...transfers.flatMap(({ cookbookId, heirId }) => [
        prisma.cookbook.update({
          where: { id: cookbookId },
          data: { ownerId: heirId },
        }),
        prisma.cookbookMember.update({
          where: { cookbookId_userId: { cookbookId, userId: heirId } },
          data: { role: CookbookRole.OWNER },
        }),
      ]),
      prisma.recipe.deleteMany({ where: { id: { in: deleteRecipeIds } } }),
      prisma.cookbook.deleteMany({ where: { id: { in: deleteCookbookIds } } }),
      prisma.user.delete({ where: { id: userId } }),
    ]);
  },
};
