import { prisma } from "@/lib/prisma";
import { CookbookRole } from "@/generated/prisma/enums";

// The ONLY module that talks to Prisma for the Cookbook table. Mirrors the
// contract of user.repository: callers above this layer speak in method calls
// and domain errors, never in Prisma queries.

type CreateCookbookInput = {
  ownerId: string;
  title: string;
  description: string | null;
};

export const cookbookRepository = {
  /**
   * Create a cookbook and, in the same write, the owner's `CookbookMember` row.
   *
   * This pairing is the invariant the rest of the app leans on: **membership is
   * the single source of truth for "who can see this cookbook"**. `ownerId`
   * still records who may delete it, but every access check — including the
   * dashboard listing — reads `CookbookMember` alone and never has to union two
   * relations. Prisma runs a nested create in one transaction, so a cookbook can
   * never exist without its owner's membership row.
   */
  create({ ownerId, title, description }: CreateCookbookInput) {
    return prisma.cookbook.create({
      data: {
        title,
        description,
        ownerId,
        members: { create: { userId: ownerId, role: CookbookRole.OWNER } },
      },
    });
  },

  /**
   * Every cookbook this user can see, newest-touched first.
   *
   * Reads `CookbookMember` only — thanks to the invariant in `create`, owned
   * cookbooks are already in here, so there is no union with `ownedCookbooks`.
   * Scoping by `userId` in the `where` clause IS the authorization boundary:
   * no cookbook id comes from the client, so there is nothing to forge.
   */
  listForUser(userId: string) {
    return prisma.cookbookMember.findMany({
      where: { userId },
      orderBy: { cookbook: { updatedAt: "desc" } },
      select: {
        role: true,
        cookbook: {
          select: {
            id: true,
            title: true,
            description: true,
            updatedAt: true,
            _count: { select: { recipes: true, members: true } },
          },
        },
      },
    });
  },
};
