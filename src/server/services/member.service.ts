import { cache } from "react";
import {
  inviteRowSchema,
  grantableRoleSchema,
  inviteExpiry,
  oneTimeLinkExpiry,
  oneTimeLinkLabelSchema,
  daysLeft,
  type GrantableRole,
} from "@/lib/invite";
import { displayName } from "@/lib/display-name";
import { cookbookRepository } from "@/server/repositories/cookbook.repository";
import { inviteRepository } from "@/server/repositories/invite.repository";
import { userRepository } from "@/server/repositories/user.repository";
import { canManageMembers } from "@/server/permissions";
import { newUrlToken } from "@/server/tokens";
import { toCoverDesign, type CoverDesign } from "@/lib/book-covers";
import { ok, err, type Result } from "@/server/result";
import type { CookbookRole } from "@/generated/prisma/enums";

// Business logic for cookbook membership: inviting people, responding to
// invites, and adjusting who has what role. Framework-free — no next/*, no
// @clerk/* — so every rule below is unit-testable by calling it directly.
//
// The governing rule: **an invite never creates a membership.** Only the
// person joining can — by accepting an invite (`acceptInvite`), or by pressing
// Join on a cookbook's link (`joinWithLink`). That's what keeps an unwanted invite from putting a
// cookbook in someone's library.

export type MemberError =
  | { kind: "forbidden"; message: string }
  | { kind: "not-found"; message: string }
  | { kind: "validation"; message: string };

const FORBIDDEN: MemberError = {
  kind: "forbidden",
  message: "You don't have permission to manage members of this cookbook.",
};

// A cookbook a non-member asks about must look like it doesn't exist — its
// existence is itself something they shouldn't learn. Same reasoning as
// getCookbookDetail returning null.
const NOT_FOUND: MemberError = {
  kind: "not-found",
  message: "That invite is no longer available.",
};

/** Resolve the actor's role and confirm they may manage members. */
async function requireManager(
  actorUserId: string,
  cookbookId: string,
): Promise<Result<true, MemberError>> {
  const membership = await cookbookRepository.findMembership(
    cookbookId,
    actorUserId,
  );
  if (!membership || !canManageMembers(membership.role)) return err(FORBIDDEN);
  return ok(true);
}

// ---------------------------------------------------------------------------
// Inviting
// ---------------------------------------------------------------------------

/** One row of the batch invite form, as the browser submits it. */
export type InviteRowInput = { username: string; role: string };

/**
 * What happened to one row. The form sends several people at once, so a single
 * error string can't describe the result — three can succeed while two fail,
 * and the user needs to know which were which.
 */
export type InviteOutcome =
  | { username: string; status: "invited"; role: GrantableRole }
  | { username: string; status: "not-found" }
  | { username: string; status: "already-member" }
  | { username: string; status: "duplicate" }
  | { username: string; status: "self" }
  | { username: string; status: "invalid"; message: string };

// A row the user added but never filled in shouldn't fail validation — it
// should just not exist. Mirrors isBlankIngredient in recipe.service.
const isBlankRow = (row: InviteRowInput) => row.username.trim() === "";

/**
 * Invite people to a cookbook by username.
 *
 * Every invited row lands as a PENDING invite, never a membership — the
 * recipient decides. Roles are per-row because the form collects them that way;
 * they stay editable afterwards on both the pending invite and the membership,
 * so nothing here is a decision the owner is stuck with.
 *
 * The outer `Result` fails only for whole-request problems (not an owner,
 * nothing to send). Per-person problems come back as outcomes, in the order the
 * rows were submitted.
 */
export async function inviteMembers(
  actorUserId: string,
  cookbookId: string,
  rows: InviteRowInput[],
): Promise<Result<InviteOutcome[], MemberError>> {
  // Authorization before anything else: a non-manager shouldn't learn whether a
  // username exists, or who is already in a cookbook they can't administer.
  const allowed = await requireManager(actorUserId, cookbookId);
  if (!allowed.ok) return allowed;

  const filled = rows.filter((row) => !isBlankRow(row));
  if (filled.length === 0) {
    return err({
      kind: "validation",
      message: "Add at least one person to invite.",
    });
  }

  // Parse first, so a malformed handle is reported against its own row rather
  // than failing the whole batch.
  const parsed = filled.map((row) => {
    const result = inviteRowSchema.safeParse(row);
    return result.success
      ? ({ kind: "ok" as const, raw: row.username, ...result.data })
      : ({
          kind: "invalid" as const,
          raw: row.username,
          message:
            result.error.issues[0]?.message ?? "Check this username and role.",
        });
  });

  // Same person twice in one batch is a slip, not two invites — and because
  // sending upserts on (cookbook, person), letting both through would silently
  // apply whichever role happened to land last.
  const seen = new Set<string>();
  const deduped = parsed.map((row) => {
    if (row.kind !== "ok") return row;
    if (seen.has(row.username)) return { ...row, kind: "duplicate" as const };
    seen.add(row.username);
    return row;
  });

  const wanted = deduped.filter((row) => row.kind === "ok");

  // Two batched lookups rather than two per row.
  const found = await userRepository.findManyByUsernames(
    wanted.map((row) => row.username),
  );
  const idByUsername = new Map(
    found.flatMap((user) => (user.username ? [[user.username, user.id]] : [])),
  );
  const existingMembers = new Set(
    (
      await cookbookRepository.findMembershipsForUsers(
        cookbookId,
        [...idByUsername.values()],
      )
    ).map((member) => member.userId),
  );

  const expiresAt = inviteExpiry();

  // Sequential rather than Promise.all: these are upserts racing for the same
  // unique keys, and a predictable order makes a failure mid-batch easy to
  // reason about. Batches are single digits, so the round trips don't matter.
  const outcomes: InviteOutcome[] = [];
  for (const row of deduped) {
    if (row.kind === "invalid") {
      outcomes.push({
        username: row.raw,
        status: "invalid",
        message: row.message,
      });
      continue;
    }
    if (row.kind === "duplicate") {
      outcomes.push({ username: row.username, status: "duplicate" });
      continue;
    }

    const invitedUserId = idByUsername.get(row.username);
    if (!invitedUserId) {
      outcomes.push({ username: row.username, status: "not-found" });
      continue;
    }
    if (invitedUserId === actorUserId) {
      outcomes.push({ username: row.username, status: "self" });
      continue;
    }
    if (existingMembers.has(invitedUserId)) {
      outcomes.push({ username: row.username, status: "already-member" });
      continue;
    }

    await inviteRepository.upsert({
      cookbookId,
      invitedById: actorUserId,
      role: row.role,
      expiresAt,
      target: { kind: "user", invitedUserId },
    });
    outcomes.push({ username: row.username, status: "invited", role: row.role });
  }

  return ok(outcomes);
}

// ---------------------------------------------------------------------------
// Responding to an invite
// ---------------------------------------------------------------------------

export type PendingInviteSummary = {
  id: string;
  cookbookId: string;
  cookbookTitle: string;
  cookbookDescription: string | null;
  role: CookbookRole;
  invitedByName: string;
};

/** The invites awaiting this user's answer, for their dashboard. */
export async function listPendingInvites(
  userId: string,
): Promise<PendingInviteSummary[]> {
  const invites = await inviteRepository.listPendingForUser(userId);

  return invites.map((invite) => ({
    id: invite.id,
    cookbookId: invite.cookbook.id,
    cookbookTitle: invite.cookbook.title,
    cookbookDescription: invite.cookbook.description,
    role: invite.role,
    invitedByName: displayName(invite.invitedBy),
  }));
}

/**
 * Confirm this invite is genuinely this user's to answer, and still answerable.
 *
 * An invite addressed to someone else reads as not-found rather than forbidden,
 * for the same reason cookbooks do: the id came from the client, and confirming
 * that some *other* invite exists at that id is itself a leak.
 */
async function loadAnswerableInvite(userId: string, inviteId: string) {
  const invite = await inviteRepository.findById(inviteId);
  if (!invite || invite.invitedUserId !== userId) return err(NOT_FOUND);
  if (invite.status !== "PENDING") {
    return err({
      kind: "validation" as const,
      message: "You've already answered this invite.",
    });
  }
  if (invite.expiresAt.getTime() <= Date.now()) {
    return err({
      kind: "validation" as const,
      message: "This invite has expired. Ask for a new one.",
    });
  }
  return ok(invite);
}

/** Accept: this is the only place a membership is created from an invite. */
export async function acceptInvite(
  userId: string,
  inviteId: string,
): Promise<Result<{ cookbookId: string }, MemberError>> {
  const loaded = await loadAnswerableInvite(userId, inviteId);
  if (!loaded.ok) return loaded;

  const invite = loaded.value;
  await inviteRepository.accept(
    invite.id,
    userId,
    invite.cookbookId,
    invite.role,
  );

  return ok({ cookbookId: invite.cookbookId });
}

/** Decline. The row stays DECLINED — that refusal is what blocking would read. */
export async function declineInvite(
  userId: string,
  inviteId: string,
): Promise<Result<true, MemberError>> {
  const loaded = await loadAnswerableInvite(userId, inviteId);
  if (!loaded.ok) return loaded;

  await inviteRepository.decline(loaded.value.id);
  return ok(true);
}

// ---------------------------------------------------------------------------
// Viewing and adjusting membership
// ---------------------------------------------------------------------------

export type MemberSummary = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: CookbookRole;
  isOwner: boolean;
  isSelf: boolean;
};

export type OutstandingInvite = {
  id: string;
  name: string;
  role: CookbookRole;
};

export type MembersView = {
  cookbookId: string;
  cookbookTitle: string;
  canManageMembers: boolean;
  members: MemberSummary[];
  /** Empty unless the viewer can manage members — outstanding invites are
   * administrative detail, not something every member needs to see. */
  outstandingInvites: OutstandingInvite[];
  /** The join link's state — null unless the viewer can manage members, since
   * the token itself is the permission to join. */
  joinLink: JoinLinkView | null;
  /** Unused one-time links, newest first — empty unless the viewer manages
   * members, for the same reason as `joinLink`. */
  oneTimeLinks: OneTimeLinkView[];
};

/**
 * Who's in a cookbook, as seen by this user — or `null` if they aren't a
 * member, which the caller should surface as a 404.
 *
 * Every member can see the roster; only a manager sees pending invites and gets
 * `canManageMembers`, which is what the view keys its controls off.
 */
export async function getCookbookMembers(
  userId: string,
  cookbookId: string,
): Promise<MembersView | null> {
  const membership = await cookbookRepository.findMembership(
    cookbookId,
    userId,
  );
  if (!membership) return null;

  const cookbook = await cookbookRepository.findById(cookbookId);
  if (!cookbook) return null;

  const manages = canManageMembers(membership.role);
  const [members, invites, link, oneTimeLinks] = await Promise.all([
    cookbookRepository.listMembers(cookbookId),
    manages
      ? inviteRepository.listPendingForCookbook(cookbookId)
      : Promise.resolve([]),
    manages ? cookbookRepository.findJoinLink(cookbookId) : Promise.resolve(null),
    manages ? inviteRepository.listPendingLinks(cookbookId) : Promise.resolve([]),
  ]);
  const now = new Date();

  return {
    cookbookId: cookbook.id,
    cookbookTitle: cookbook.title,
    canManageMembers: manages,
    members: members.map((member) => ({
      userId: member.user.id,
      name: displayName(member.user),
      avatarUrl: member.user.avatarUrl,
      role: member.role,
      isOwner: member.user.id === cookbook.ownerId,
      isSelf: member.user.id === userId,
    })),
    outstandingInvites: invites.map((invite) => ({
      id: invite.id,
      // An invite is addressed to an account or to an email, never both, so
      // exactly one of these is set. `??` picks whichever it is.
      name: invite.invitedUser
        ? displayName(invite.invitedUser)
        : (invite.email ?? "Unknown"),
      role: invite.role,
    })),
    joinLink: link
      ? { token: link.joinLinkToken, role: grantableOrViewer(link.joinLinkRole) }
      : null,
    oneTimeLinks: oneTimeLinks.map((row) => toOneTimeLinkView(row, now)),
  };
}

/**
 * The owner's own membership row is off-limits: `Cookbook.ownerId` is a scalar
 * column that would disagree with a demoted or deleted OWNER membership. Both
 * changing a role and removing a member run through this.
 */
async function requireMutableMember(
  actorUserId: string,
  cookbookId: string,
  targetUserId: string,
): Promise<Result<true, MemberError>> {
  const allowed = await requireManager(actorUserId, cookbookId);
  if (!allowed.ok) return allowed;

  const cookbook = await cookbookRepository.findById(cookbookId);
  if (!cookbook) return err(FORBIDDEN);
  if (cookbook.ownerId === targetUserId) {
    return err({
      kind: "forbidden",
      message:
        "The owner's role can't be changed here. Transfer the cookbook instead.",
    });
  }
  return ok(true);
}

export async function changeMemberRole(
  actorUserId: string,
  cookbookId: string,
  targetUserId: string,
  role: string,
): Promise<Result<{ role: GrantableRole }, MemberError>> {
  const allowed = await requireMutableMember(
    actorUserId,
    cookbookId,
    targetUserId,
  );
  if (!allowed.ok) return allowed;

  const parsed = grantableRoleSchema.safeParse(role);
  if (!parsed.success) {
    return err({ kind: "validation", message: "Pick a valid role." });
  }

  await cookbookRepository.updateMemberRole(
    cookbookId,
    targetUserId,
    parsed.data,
  );
  return ok({ role: parsed.data });
}

/**
 * Remove someone from a cookbook. Their recipes stay — `Recipe.authorId` is
 * `onDelete: Restrict` against the user, and the recipes belong to the cookbook
 * regardless of whether their author still has access to it.
 */
export async function removeMember(
  actorUserId: string,
  cookbookId: string,
  targetUserId: string,
): Promise<Result<true, MemberError>> {
  const allowed = await requireMutableMember(
    actorUserId,
    cookbookId,
    targetUserId,
  );
  if (!allowed.ok) return allowed;

  await cookbookRepository.removeMember(cookbookId, targetUserId);
  return ok(true);
}

// ---------------------------------------------------------------------------
// Adjusting an invite that hasn't been answered yet
// ---------------------------------------------------------------------------

/** Load an invite and confirm the actor administers the cookbook it's for. */
async function requireManagedInvite(actorUserId: string, inviteId: string) {
  const invite = await inviteRepository.findById(inviteId);
  if (!invite) return err(NOT_FOUND);

  const allowed = await requireManager(actorUserId, invite.cookbookId);
  if (!allowed.ok) return allowed;

  return ok(invite);
}

export async function changeInviteRole(
  actorUserId: string,
  inviteId: string,
  role: string,
): Promise<Result<true, MemberError>> {
  const loaded = await requireManagedInvite(actorUserId, inviteId);
  if (!loaded.ok) return loaded;

  const parsed = grantableRoleSchema.safeParse(role);
  if (!parsed.success) {
    return err({ kind: "validation", message: "Pick a valid role." });
  }

  await inviteRepository.updateRole(loaded.value.id, parsed.data);
  return ok(true);
}

/** Withdraw an invite before it's answered. */
export async function cancelInvite(
  actorUserId: string,
  inviteId: string,
): Promise<Result<true, MemberError>> {
  const loaded = await requireManagedInvite(actorUserId, inviteId);
  if (!loaded.ok) return loaded;

  await inviteRepository.remove(loaded.value.id);
  return ok(true);
}

// ---------------------------------------------------------------------------
// The "anyone with this link can join" link
// ---------------------------------------------------------------------------

/** The link as its owner sees it. `token` is null while it's turned off. */
export type JoinLinkView = { token: string | null; role: GrantableRole };

/**
 * A link may only grant what an invite may — never OWNER. The column is the
 * wider `CookbookRole`, so anything else read back from it is treated as the
 * safe default rather than trusted.
 */
function grantableOrViewer(role: CookbookRole): GrantableRole {
  const parsed = grantableRoleSchema.safeParse(role);
  return parsed.success ? parsed.data : "VIEWER";
}

/**
 * Turn the link on or off. Turning it on always mints a fresh token rather
 * than reviving the last one, so a URL that was out there before it was turned
 * off stays dead. Off → on is how an owner starts over, the same as a reset.
 */
export async function setJoinLinkEnabled(
  actorUserId: string,
  cookbookId: string,
  enabled: boolean,
): Promise<Result<JoinLinkView, MemberError>> {
  const allowed = await requireManager(actorUserId, cookbookId);
  if (!allowed.ok) return allowed;

  const current = await cookbookRepository.findJoinLink(cookbookId);
  if (!current) return err(NOT_FOUND);

  const saved = await cookbookRepository.setJoinLink(cookbookId, {
    token: enabled ? (current.joinLinkToken ?? newUrlToken()) : null,
    role: current.joinLinkRole,
  });
  return ok({ token: saved.joinLinkToken, role: grantableOrViewer(saved.joinLinkRole) });
}

/**
 * Change what the link grants. The URL doesn't change: whoever already has it
 * simply gets the new role from now on. Nobody who joined earlier is touched.
 */
export async function setJoinLinkRole(
  actorUserId: string,
  cookbookId: string,
  rawRole: string,
): Promise<Result<JoinLinkView, MemberError>> {
  const allowed = await requireManager(actorUserId, cookbookId);
  if (!allowed.ok) return allowed;

  const role = grantableRoleSchema.safeParse(rawRole);
  if (!role.success) {
    return err({ kind: "validation", message: "Pick a valid role." });
  }

  const current = await cookbookRepository.findJoinLink(cookbookId);
  if (!current) return err(NOT_FOUND);

  const saved = await cookbookRepository.setJoinLink(cookbookId, {
    token: current.joinLinkToken,
    role: role.data,
  });
  return ok({ token: saved.joinLinkToken, role: grantableOrViewer(saved.joinLinkRole) });
}

/**
 * Replace the token, so the old URL stops working — for a link that has gone
 * further than it was meant to. Only meaningful while it's on.
 */
export async function resetJoinLink(
  actorUserId: string,
  cookbookId: string,
): Promise<Result<JoinLinkView, MemberError>> {
  const allowed = await requireManager(actorUserId, cookbookId);
  if (!allowed.ok) return allowed;

  const current = await cookbookRepository.findJoinLink(cookbookId);
  if (!current) return err(NOT_FOUND);
  if (!current.joinLinkToken) {
    return err({ kind: "validation", message: "The link is turned off." });
  }

  const saved = await cookbookRepository.setJoinLink(cookbookId, {
    token: newUrlToken(),
    role: current.joinLinkRole,
  });
  return ok({ token: saved.joinLinkToken, role: grantableOrViewer(saved.joinLinkRole) });
}

/** What the join page shows someone holding a link, before they join. */
export type JoinLinkPreview = {
  cookbookId: string;
  title: string;
  description: string | null;
  design: CoverDesign;
  role: GrantableRole;
  ownerName: string;
  memberCount: number;
  /** Whether the person looking is in already — they skip straight in. */
  alreadyMember: boolean;
  /** A one-time link, spent by whoever joins with it first. */
  singleUse: boolean;
};

/**
 * What a token opens: the cookbook's shared link, or one of its one-time
 * links. The two live in different tables — a cookbook column, an invite row —
 * but the person holding one sees the same page and presses the same button,
 * so everything past this lookup treats them alike.
 */
async function resolveJoinToken(token: string) {
  const shared = await cookbookRepository.findByJoinToken(token);
  if (shared) {
    return {
      singleUse: false as const,
      role: grantableOrViewer(shared.joinLinkRole),
      cookbook: shared,
    };
  }

  const oneTime = await inviteRepository.findPendingLinkByToken(token);
  if (oneTime) {
    return {
      singleUse: true as const,
      inviteId: oneTime.id,
      role: grantableOrViewer(oneTime.role),
      cookbook: oneTime.cookbook,
    };
  }

  return null;
}

/**
 * Look a link up without joining. Cached per request, so the page and its
 * metadata share one lookup. `viewerId` is optional because the page
 * shows this to people who haven't signed up yet: holding the token is the
 * permission, and it reveals only what the owner chose to share by sending it.
 */
export const previewJoinLink = cache(async function previewJoinLink(
  token: string,
  viewerId?: string,
): Promise<JoinLinkPreview | null> {
  const link = await resolveJoinToken(token);
  if (!link) return null;
  const { cookbook } = link;

  const membership = viewerId
    ? await cookbookRepository.findMembership(cookbook.id, viewerId)
    : null;

  return {
    cookbookId: cookbook.id,
    title: cookbook.title,
    description: cookbook.description,
    design: toCoverDesign(cookbook),
    role: link.role,
    ownerName: displayName(cookbook.owner),
    memberCount: cookbook._count.members,
    alreadyMember: membership !== null,
    singleUse: link.singleUse,
  };
});

const DEAD_LINK: MemberError = {
  kind: "not-found",
  message: "This link doesn't work any more. Ask whoever sent it for a new one.",
};

/**
 * Join a cookbook through a link — its shared one, or a one-time one. The
 * token is looked up again here rather than trusted from the page: it may have
 * been reset, revoked or used since the page was shown. Someone already in the
 * cookbook keeps the role they have.
 */
export async function joinWithLink(
  userId: string,
  token: string,
): Promise<Result<{ cookbookId: string }, MemberError>> {
  const link = await resolveJoinToken(token);
  if (!link) return err(DEAD_LINK);
  const cookbookId = link.cookbook.id;

  if (!link.singleUse) {
    await cookbookRepository.joinByLink(cookbookId, userId, link.role);
    return ok({ cookbookId });
  }

  // A one-time link is only spent on someone it lets in. A member opening it
  // by mistake — or the owner checking what they're about to send — mustn't
  // use it up before the person it was meant for gets there.
  const membership = await cookbookRepository.findMembership(cookbookId, userId);
  if (membership) return ok({ cookbookId });

  const claimed = await inviteRepository.claimLink(
    link.inviteId,
    userId,
    cookbookId,
    link.role,
  );
  // Someone else used it between the lookup and the claim.
  if (!claimed) return err(DEAD_LINK);
  return ok({ cookbookId });
}

// ---------------------------------------------------------------------------
// One-time links
// ---------------------------------------------------------------------------

/** A one-time link as its owner sees it in the Share dialog. */
export type OneTimeLinkView = {
  id: string;
  token: string;
  role: GrantableRole;
  label: string | null;
  /** Whole days until it stops working — 1 means "expires within a day". */
  daysLeft: number;
};

function toOneTimeLinkView(
  row: { id: string; token: string; role: CookbookRole; label: string | null; expiresAt: Date },
  now: Date,
): OneTimeLinkView {
  return {
    id: row.id,
    token: row.token,
    role: grantableOrViewer(row.role),
    label: row.label,
    daysLeft: daysLeft(row.expiresAt, now),
  };
}

/**
 * Make a link that lets one person in, once. Owners only, like every other
 * way of widening who can see a cookbook.
 */
export async function createOneTimeLink(
  actorUserId: string,
  cookbookId: string,
  rawRole: string,
  rawLabel: string,
  now: Date = new Date(),
): Promise<Result<OneTimeLinkView, MemberError>> {
  const allowed = await requireManager(actorUserId, cookbookId);
  if (!allowed.ok) return allowed;

  const role = grantableRoleSchema.safeParse(rawRole);
  if (!role.success) {
    return err({ kind: "validation", message: "Pick a valid role." });
  }
  const label = oneTimeLinkLabelSchema.safeParse(rawLabel);
  if (!label.success) {
    return err({
      kind: "validation",
      message: label.error.issues[0]?.message ?? "Check the label.",
    });
  }

  const created = await inviteRepository.createLink({
    cookbookId,
    invitedById: actorUserId,
    role: role.data,
    expiresAt: oneTimeLinkExpiry(now),
    label: label.data,
  });
  return ok(toOneTimeLinkView(created, now));
}
