import { prisma } from "@/lib/prisma";
import { newUrlToken } from "@/server/tokens";
import { coverColumns } from "@/server/repositories/cookbook.repository";
import { CookbookRole, InviteStatus } from "@/generated/prisma/enums";

// The ONLY module that talks to Prisma for the CookbookInvite table.
//
// It also carries a rule the database can't: an invite is addressed to an
// existing account, OR an email, OR — for a one-time link — to neither, but
// never to both. Prisma has no CHECK constraint, so the shapes below are the
// enforcement: `upsert` takes exactly one target, and `createLink` takes none.

/** Addressed to someone who already has an account (found by username). */
type UserTarget = { kind: "user"; invitedUserId: string };
/** Addressed to someone who doesn't yet. Unused until email delivery exists. */
type EmailTarget = { kind: "email"; email: string };
export type InviteTarget = UserTarget | EmailTarget;

type UpsertInviteInput = {
  cookbookId: string;
  invitedById: string;
  role: CookbookRole;
  expiresAt: Date;
  target: InviteTarget;
};

// Splits a target into the two mutually-exclusive columns. Whichever side isn't
// used is explicitly null rather than left undefined, so an *upsert* over a row
// addressed the other way can't leave a stale value behind in both columns.
function targetColumns(target: InviteTarget) {
  return target.kind === "user"
    ? { invitedUserId: target.invitedUserId, email: null }
    : { invitedUserId: null, email: target.email };
}

/** What makes an invite row a one-time link: addressed to no one. */
const oneTimeLinkRows = { invitedUserId: null, email: null } as const;

/** What the owner's list of one-time links shows, and copies from. */
const oneTimeLinkColumns = {
  id: true,
  token: true,
  role: true,
  label: true,
  expiresAt: true,
} as const;

export const inviteRepository = {
  /**
   * Send an invite, or re-send an existing one.
   *
   * Upsert, not create: the unique key is (cookbook, person), so re-inviting
   * updates the row that's already there instead of stacking a second
   * notification. A previously DECLINED or EXPIRED invite is flipped back to
   * PENDING with a fresh token and expiry — which is also the reason declining
   * doesn't yet stop a re-invite. That's the hook a blocking feature would use.
   */
  upsert({
    cookbookId,
    invitedById,
    role,
    expiresAt,
    target,
  }: UpsertInviteInput) {
    const columns = targetColumns(target);
    const where =
      target.kind === "user"
        ? {
            cookbookId_invitedUserId: {
              cookbookId,
              invitedUserId: target.invitedUserId,
            },
          }
        : { cookbookId_email: { cookbookId, email: target.email } };

    return prisma.cookbookInvite.upsert({
      where,
      create: {
        cookbookId,
        invitedById,
        role,
        expiresAt,
        // Generated for every invite even though in-app ones are accepted by
        // id — it costs one column and means any invite can become a link.
        token: newUrlToken(),
        ...columns,
      },
      update: {
        invitedById,
        role,
        expiresAt,
        status: InviteStatus.PENDING,
        token: newUrlToken(),
      },
      select: { id: true },
    });
  },

  /**
   * Pending invites addressed to this user, for their dashboard. Expired ones
   * are filtered out by date rather than by status: nothing sweeps the table to
   * flip PENDING → EXPIRED, so `expiresAt` is the honest source of truth.
   */
  listPendingForUser(userId: string, now: Date = new Date()) {
    return prisma.cookbookInvite.findMany({
      where: {
        invitedUserId: userId,
        status: InviteStatus.PENDING,
        expiresAt: { gt: now },
        // An archived cookbook is gone as far as its members are concerned, so
        // a pending invite to one shouldn't sit on someone's dashboard asking
        // them to join it.
        cookbook: { archivedAt: null },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        role: true,
        createdAt: true,
        cookbook: { select: { id: true, title: true, description: true } },
        invitedBy: {
          select: { username: true, firstName: true, lastName: true },
        },
      },
    });
  },

  /**
   * Outstanding invites to people, for whoever can manage members. One-time
   * links are listed separately (`listPendingLinks`): they name nobody, so in
   * a list of names each would read as "Unknown".
   */
  listPendingForCookbook(cookbookId: string, now: Date = new Date()) {
    return prisma.cookbookInvite.findMany({
      where: {
        cookbookId,
        status: InviteStatus.PENDING,
        expiresAt: { gt: now },
        NOT: oneTimeLinkRows,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        role: true,
        email: true,
        createdAt: true,
        invitedUser: {
          select: { username: true, firstName: true, lastName: true },
        },
      },
    });
  },

  /** The fields needed to decide whether this user may act on this invite. */
  findById(inviteId: string) {
    return prisma.cookbookInvite.findUnique({
      where: { id: inviteId },
      select: {
        id: true,
        cookbookId: true,
        invitedUserId: true,
        role: true,
        status: true,
        expiresAt: true,
      },
    });
  },

  /**
   * Accept: mark the invite ACCEPTED and create the membership in one
   * transaction, so there is no window where someone has agreed to join but
   * isn't a member (or is a member with a still-pending invite).
   *
   * The membership is an upsert because "already a member" is a legitimate
   * race — two clicks on Accept, or an invite that arrived after a direct add —
   * and neither should surface as a crash.
   */
  accept(inviteId: string, userId: string, cookbookId: string, role: CookbookRole) {
    return prisma.$transaction([
      prisma.cookbookInvite.update({
        where: { id: inviteId },
        data: { status: InviteStatus.ACCEPTED },
      }),
      prisma.cookbookMember.upsert({
        where: { cookbookId_userId: { cookbookId, userId } },
        create: { cookbookId, userId, role },
        update: { role },
      }),
    ]);
  },

  /** Decline: the row stays, so a future blocking feature can read the refusal. */
  decline(inviteId: string) {
    return prisma.cookbookInvite.update({
      where: { id: inviteId },
      data: { status: InviteStatus.DECLINED },
    });
  },

  /** Change the role a pending invite would grant. */
  updateRole(inviteId: string, role: CookbookRole) {
    return prisma.cookbookInvite.update({
      where: { id: inviteId },
      data: { role },
      select: { id: true },
    });
  },

  /**
   * Withdraw an invite. A hard delete, unlike decline: the inviter changing
   * their mind leaves nothing worth remembering, and it frees the unique key so
   * the person can be invited again cleanly.
   */
  remove(inviteId: string) {
    return prisma.cookbookInvite.delete({ where: { id: inviteId } });
  },

  // ---- One-time links -------------------------------------------------------

  /** A new single-use link: an invite addressed to whoever holds its token. */
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
        ...oneTimeLinkRows,
      },
      select: oneTimeLinkColumns,
    });
  },

  /** A cookbook's unused, unexpired one-time links, newest first. */
  listPendingLinks(cookbookId: string, now: Date = new Date()) {
    return prisma.cookbookInvite.findMany({
      where: {
        cookbookId,
        status: InviteStatus.PENDING,
        expiresAt: { gt: now },
        ...oneTimeLinkRows,
      },
      orderBy: { createdAt: "desc" },
      select: oneTimeLinkColumns,
    });
  },

  /**
   * The unused one-time link a token opens, with what the join page shows —
   * or null for a token that's unknown, used, revoked, expired, belongs to an
   * archived cookbook, or is an in-app invite's (those are accepted by id and
   * their tokens are never handed out, so they must not work as links).
   */
  findPendingLinkByToken(token: string, now: Date = new Date()) {
    return prisma.cookbookInvite.findFirst({
      where: {
        token,
        status: InviteStatus.PENDING,
        expiresAt: { gt: now },
        ...oneTimeLinkRows,
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
   * Use a one-time link: claim it and add the member, in one transaction.
   * Returns false when the link was no longer there to claim.
   *
   * The claim is a conditional update — only a row still PENDING and unexpired
   * matches — so when two people press Join at the same moment, exactly one
   * update changes a row and the other finds nothing. Checking first and
   * writing after would let both through. An existing membership is left as it
   * is, and any invite still waiting for them in the cookbook is settled, the
   * same as joining through the cookbook's shared link.
   */
  claimLink(
    inviteId: string,
    userId: string,
    cookbookId: string,
    role: CookbookRole,
    now: Date = new Date(),
  ) {
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.cookbookInvite.updateMany({
        where: {
          id: inviteId,
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
      await tx.cookbookInvite.updateMany({
        where: { cookbookId, invitedUserId: userId, status: InviteStatus.PENDING },
        data: { status: InviteStatus.ACCEPTED },
      });
      return true;
    });
  },

};
