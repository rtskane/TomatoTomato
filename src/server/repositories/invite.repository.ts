import { prisma } from "@/lib/prisma";
import { newUrlToken } from "@/server/tokens";
import { coverColumns } from "@/server/repositories/cookbook.repository";
import { CookbookRole, InviteStatus } from "@/generated/prisma/enums";

// The ONLY module that talks to Prisma for the CookbookInvite table — which
// holds one-time links: each made for one person and spent by whoever uses its
// token first. (The table keeps its name from when it also held invitations by
// username.)

/** What the owner's list of links shows, and copies from. */
const linkColumns = {
  id: true,
  token: true,
  role: true,
  label: true,
  expiresAt: true,
} as const;

export const inviteRepository = {
  /** A new single-use link, addressed to whoever holds its token. */
  createLink({
    cookbookId,
    invitedById,
    role,
    expiresAt,
    label,
  }: {
    cookbookId: string;
    invitedById: string;
    role: CookbookRole;
    expiresAt: Date;
    label: string | null;
  }) {
    return prisma.cookbookInvite.create({
      data: {
        cookbookId,
        invitedById,
        role,
        expiresAt,
        label,
        token: newUrlToken(),
      },
      select: linkColumns,
    });
  },

  /**
   * A cookbook's unused, unexpired links, newest first. Expired ones are
   * filtered out by date rather than by status: nothing sweeps the table, so
   * `expiresAt` is the honest source of truth.
   */
  listPendingLinks(cookbookId: string, now: Date = new Date()) {
    return prisma.cookbookInvite.findMany({
      where: {
        cookbookId,
        status: InviteStatus.PENDING,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
      select: linkColumns,
    });
  },

  /** Enough to check who may act on a link: which cookbook it belongs to. */
  findLinkById(linkId: string) {
    return prisma.cookbookInvite.findUnique({
      where: { id: linkId },
      select: { id: true, cookbookId: true },
    });
  },

  /**
   * The unused link a token opens, with what the join page shows — or null for
   * a token that's unknown, used, revoked, expired, or belongs to an archived
   * cookbook. All of those are the same thing to the person holding it.
   */
  findPendingLinkByToken(token: string, now: Date = new Date()) {
    return prisma.cookbookInvite.findFirst({
      where: {
        token,
        status: InviteStatus.PENDING,
        expiresAt: { gt: now },
        cookbook: { archivedAt: null },
      },
      select: {
        id: true,
        role: true,
        cookbook: {
          select: {
            id: true,
            title: true,
            description: true,
            ...coverColumns,
            owner: { select: { username: true, firstName: true, lastName: true } },
            _count: { select: { members: true } },
          },
        },
      },
    });
  },

  /**
   * Use a link: claim it and add the member, in one transaction. Returns false
   * when the link was no longer there to claim.
   *
   * The claim is a conditional update — only a row still PENDING and unexpired
   * matches — so when two people press Join at the same moment, exactly one
   * update changes a row and the other finds nothing. Checking first and
   * writing after would let both through. An existing membership is left as
   * it is.
   */
  claimLink(
    linkId: string,
    userId: string,
    cookbookId: string,
    role: CookbookRole,
    now: Date = new Date(),
  ) {
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.cookbookInvite.updateMany({
        where: {
          id: linkId,
          status: InviteStatus.PENDING,
          expiresAt: { gt: now },
        },
        data: { status: InviteStatus.ACCEPTED },
      });
      if (claimed.count === 0) return false;

      await tx.cookbookMember.upsert({
        where: { cookbookId_userId: { cookbookId, userId } },
        create: { cookbookId, userId, role },
        update: {},
      });
      return true;
    });
  },

  /**
   * Revoke a link before it's used. A hard delete: the owner changing their
   * mind leaves nothing worth remembering.
   */
  revokeLink(linkId: string) {
    return prisma.cookbookInvite.delete({ where: { id: linkId } });
  },
};
