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

  /**
   * One cookbook with its recipes, as seen by this user — or `null` if they
   * aren't a member.
   *
   * Unlike `listForUser`, here the cookbook id DOES come from the URL, so it
   * could be forged. The defense is the composite key: we look up the
   * membership `(cookbookId, userId)` rather than the cookbook, so a
   * non-member's request finds nothing instead of leaking a title. Auth and
   * data come back in one query.
   */
  findDetailForUser(cookbookId: string, userId: string) {
    return prisma.cookbookMember.findUnique({
      where: { cookbookId_userId: { cookbookId, userId } },
      select: {
        role: true,
        cookbook: {
          select: {
            id: true,
            title: true,
            description: true,
            recipes: {
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                title: true,
                description: true,
                servings: true,
                prepTimeMinutes: true,
                cookTimeMinutes: true,
                author: {
                  select: { username: true, firstName: true, lastName: true },
                },
                _count: { select: { ingredients: true, steps: true } },
              },
            },
          },
        },
      },
    });
  },

  /**
   * Just the viewer's role in a cookbook, for permission checks that don't need
   * the cookbook itself. `null` means "not a member".
   */
  findMembership(cookbookId: string, userId: string) {
    return prisma.cookbookMember.findUnique({
      where: { cookbookId_userId: { cookbookId, userId } },
      select: { role: true },
    });
  },

  /**
   * The cookbook's own row — currently just `ownerId`, which the member
   * management guards need in order to refuse demoting or removing the owner.
   */
  findById(cookbookId: string) {
    return prisma.cookbook.findUnique({
      where: { id: cookbookId },
      select: { id: true, title: true, ownerId: true },
    });
  },

  /** Everyone in a cookbook, owner first, then by when they joined. */
  listMembers(cookbookId: string) {
    return prisma.cookbookMember.findMany({
      where: { cookbookId },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: {
        role: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
    });
  },

  /**
   * Which of these users are already members. Used by the batch invite path to
   * skip people who are in the cookbook already, in one query rather than N.
   */
  findMembershipsForUsers(cookbookId: string, userIds: string[]) {
    return prisma.cookbookMember.findMany({
      where: { cookbookId, userId: { in: userIds } },
      select: { userId: true },
    });
  },

  updateMemberRole(cookbookId: string, userId: string, role: CookbookRole) {
    return prisma.cookbookMember.update({
      where: { cookbookId_userId: { cookbookId, userId } },
      data: { role },
      select: { role: true },
    });
  },

  removeMember(cookbookId: string, userId: string) {
    return prisma.cookbookMember.delete({
      where: { cookbookId_userId: { cookbookId, userId } },
    });
  },
};
