import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { CookbookRole, InviteStatus } from "@/generated/prisma/enums";

// The ONLY module that talks to Prisma for the CookbookInvite table.
//
// It also carries a rule the database can't: an invite is addressed to EITHER
// an existing account OR an email, never both and never neither. Prisma has no
// CHECK constraint, so `InviteTarget` below is the enforcement — there is no
// way to call `upsert` with a shape that sets both or neither.

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

/**
 * URL-safe, 256 bits of entropy. Generated for every invite even though in-app
 * ones are accepted by id — it costs one column and means any invite can become
 * a shareable link the day email delivery lands.
 */
function newToken(): string {
  return randomBytes(32).toString("base64url");
}

// Splits a target into the two mutually-exclusive columns. Whichever side isn't
// used is explicitly null rather than left undefined, so an *upsert* over a row
// addressed the other way can't leave a stale value behind in both columns.
function targetColumns(target: InviteTarget) {
  return target.kind === "user"
    ? { invitedUserId: target.invitedUserId, email: null }
    : { invitedUserId: null, email: target.email };
}

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
        token: newToken(),
        ...columns,
      },
      update: {
        invitedById,
        role,
        expiresAt,
        status: InviteStatus.PENDING,
        token: newToken(),
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

  /** Outstanding invites for a cookbook, shown to whoever can manage members. */
  listPendingForCookbook(cookbookId: string, now: Date = new Date()) {
    return prisma.cookbookInvite.findMany({
      where: {
        cookbookId,
        status: InviteStatus.PENDING,
        expiresAt: { gt: now },
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
};
