import { describe, it, expect, vi, beforeEach } from "vitest";

// Fully replace the repository modules so real Prisma is never imported.
const repos = vi.hoisted(() => ({
  findMembership: vi.fn(),
  findById: vi.fn(),
  listMembers: vi.fn(),
  findMembershipsForUsers: vi.fn(),
  updateMemberRole: vi.fn(),
  removeMember: vi.fn(),
  inviteUpsert: vi.fn(),
  listPendingForUser: vi.fn(),
  listPendingForCookbook: vi.fn(),
  inviteFindById: vi.fn(),
  accept: vi.fn(),
  decline: vi.fn(),
  updateRole: vi.fn(),
  remove: vi.fn(),
  findManyByUsernames: vi.fn(),
  findJoinLink: vi.fn(),
  setJoinLink: vi.fn(),
  findByJoinToken: vi.fn(),
  joinByLink: vi.fn(),
  createLink: vi.fn(),
  listPendingLinks: vi.fn(),
  findPendingLinkByToken: vi.fn(),
  claimLink: vi.fn(),
}));

vi.mock("@/server/repositories/cookbook.repository", () => ({
  cookbookRepository: {
    findMembership: repos.findMembership,
    findById: repos.findById,
    listMembers: repos.listMembers,
    findMembershipsForUsers: repos.findMembershipsForUsers,
    updateMemberRole: repos.updateMemberRole,
    removeMember: repos.removeMember,
    findJoinLink: repos.findJoinLink,
    setJoinLink: repos.setJoinLink,
    findByJoinToken: repos.findByJoinToken,
    joinByLink: repos.joinByLink,
  },
}));
vi.mock("@/server/repositories/invite.repository", () => ({
  inviteRepository: {
    upsert: repos.inviteUpsert,
    listPendingForUser: repos.listPendingForUser,
    listPendingForCookbook: repos.listPendingForCookbook,
    findById: repos.inviteFindById,
    accept: repos.accept,
    decline: repos.decline,
    updateRole: repos.updateRole,
    remove: repos.remove,
    createLink: repos.createLink,
    listPendingLinks: repos.listPendingLinks,
    findPendingLinkByToken: repos.findPendingLinkByToken,
    claimLink: repos.claimLink,
  },
}));
vi.mock("@/server/repositories/user.repository", () => ({
  userRepository: { findManyByUsernames: repos.findManyByUsernames },
}));

import {
  inviteMembers,
  listPendingInvites,
  acceptInvite,
  declineInvite,
  getCookbookMembers,
  changeMemberRole,
  removeMember,
  changeInviteRole,
  cancelInvite,
  setJoinLinkEnabled,
  setJoinLinkRole,
  resetJoinLink,
  previewJoinLink,
  joinWithLink,
  createOneTimeLink,
} from "./member.service";

beforeEach(() => {
  vi.clearAllMocks();
  // Default: the actor owns the cookbook. Individual tests override.
  repos.findMembership.mockResolvedValue({ role: "OWNER" });
  repos.findById.mockResolvedValue({
    id: "cb1",
    title: "Weeknight Dinners",
    ownerId: "owner1",
  });
  repos.findMembershipsForUsers.mockResolvedValue([]);
  repos.findManyByUsernames.mockResolvedValue([]);
  repos.inviteUpsert.mockResolvedValue({ id: "inv1" });
  repos.findJoinLink.mockResolvedValue({ joinLinkToken: null, joinLinkRole: "VIEWER" });
  repos.listPendingLinks.mockResolvedValue([]);
  // No one-time link unless a test says so.
  repos.findPendingLinkByToken.mockResolvedValue(null);
  repos.claimLink.mockResolvedValue(true);
  // Echo what was saved, as the real update's `select` does.
  repos.setJoinLink.mockImplementation(async (_id: string, link: { token: string | null; role: string }) => ({
    joinLinkToken: link.token,
    joinLinkRole: link.role,
  }));
});

const row = (username: string, role = "VIEWER") => ({ username, role });

describe("inviteMembers", () => {
  it("refuses a non-member outright", async () => {
    repos.findMembership.mockResolvedValue(null);

    const result = await inviteMembers("u1", "cb1", [row("alice")]);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("forbidden");
    expect(repos.findManyByUsernames).not.toHaveBeenCalled();
  });

  // An EDITOR can write recipes but must not widen who can see the cookbook.
  it("refuses an EDITOR", async () => {
    repos.findMembership.mockResolvedValue({ role: "EDITOR" });

    const result = await inviteMembers("u1", "cb1", [row("alice")]);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("forbidden");
  });

  // Authorization is checked before the username lookup, so a non-manager can't
  // use the form to probe which handles exist.
  it("does not look anyone up before checking permission", async () => {
    repos.findMembership.mockResolvedValue({ role: "VIEWER" });

    await inviteMembers("u1", "cb1", [row("alice")]);

    expect(repos.findManyByUsernames).not.toHaveBeenCalled();
    expect(repos.inviteUpsert).not.toHaveBeenCalled();
  });

  it("rejects a batch with nothing filled in", async () => {
    const result = await inviteMembers("owner1", "cb1", [
      row(""),
      row("   "),
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("validation");
    expect(repos.inviteUpsert).not.toHaveBeenCalled();
  });

  // A row the user added but never filled shouldn't fail the batch.
  it("ignores blank rows among filled ones", async () => {
    repos.findManyByUsernames.mockResolvedValue([
      { id: "u_alice", username: "alice" },
    ]);

    const result = await inviteMembers("owner1", "cb1", [
      row("alice"),
      row("  "),
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(1);
  });

  it("creates a PENDING invite and never a membership", async () => {
    repos.findManyByUsernames.mockResolvedValue([
      { id: "u_alice", username: "alice" },
    ]);

    const result = await inviteMembers("owner1", "cb1", [
      row("alice", "EDITOR"),
    ]);

    expect(result.ok).toBe(true);
    expect(repos.inviteUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        cookbookId: "cb1",
        invitedById: "owner1",
        role: "EDITOR",
        target: { kind: "user", invitedUserId: "u_alice" },
      }),
    );
    // The whole point of pending invites: nothing grants access here.
    expect(repos.updateMemberRole).not.toHaveBeenCalled();
  });

  it("normalizes the typed username before looking it up", async () => {
    repos.findManyByUsernames.mockResolvedValue([
      { id: "u_alice", username: "alice" },
    ]);

    await inviteMembers("owner1", "cb1", [row("  Alice  ")]);

    expect(repos.findManyByUsernames).toHaveBeenCalledWith(["alice"]);
  });

  it("keeps a per-row role rather than applying one to the batch", async () => {
    repos.findManyByUsernames.mockResolvedValue([
      { id: "u_alice", username: "alice" },
      { id: "u_bob", username: "bob" },
    ]);

    await inviteMembers("owner1", "cb1", [
      row("alice", "EDITOR"),
      row("bob", "VIEWER"),
    ]);

    const roles = repos.inviteUpsert.mock.calls.map(
      ([arg]) => [arg.target.invitedUserId, arg.role],
    );
    expect(roles).toEqual([
      ["u_alice", "EDITOR"],
      ["u_bob", "VIEWER"],
    ]);
  });

  it("reports an unknown username without failing the batch", async () => {
    repos.findManyByUsernames.mockResolvedValue([
      { id: "u_bob", username: "bob" },
    ]);

    const result = await inviteMembers("owner1", "cb1", [
      row("ghost"),
      row("bob"),
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([
        { username: "ghost", status: "not-found" },
        { username: "bob", status: "invited", role: "VIEWER" },
      ]);
    }
    expect(repos.inviteUpsert).toHaveBeenCalledTimes(1);
  });

  it("reports someone who is already a member", async () => {
    repos.findManyByUsernames.mockResolvedValue([
      { id: "u_alice", username: "alice" },
    ]);
    repos.findMembershipsForUsers.mockResolvedValue([{ userId: "u_alice" }]);

    const result = await inviteMembers("owner1", "cb1", [row("alice")]);

    if (result.ok) {
      expect(result.value[0]).toEqual({
        username: "alice",
        status: "already-member",
      });
    }
    expect(repos.inviteUpsert).not.toHaveBeenCalled();
  });

  it("reports the actor inviting themselves", async () => {
    repos.findManyByUsernames.mockResolvedValue([
      { id: "owner1", username: "ryan" },
    ]);

    const result = await inviteMembers("owner1", "cb1", [row("ryan")]);

    if (result.ok) {
      expect(result.value[0]).toEqual({ username: "ryan", status: "self" });
    }
    expect(repos.inviteUpsert).not.toHaveBeenCalled();
  });

  // Two rows for one person would otherwise upsert twice on the same unique
  // key, silently applying whichever role happened to land last.
  it("invites a repeated username once, keeping the first role", async () => {
    repos.findManyByUsernames.mockResolvedValue([
      { id: "u_alice", username: "alice" },
    ]);

    const result = await inviteMembers("owner1", "cb1", [
      row("alice", "EDITOR"),
      row("alice", "VIEWER"),
    ]);

    expect(repos.inviteUpsert).toHaveBeenCalledTimes(1);
    expect(repos.inviteUpsert.mock.calls[0][0].role).toBe("EDITOR");
    if (result.ok) {
      expect(result.value[1]).toEqual({
        username: "alice",
        status: "duplicate",
      });
    }
  });

  it("reports a malformed username against its own row only", async () => {
    repos.findManyByUsernames.mockResolvedValue([
      { id: "u_bob", username: "bob" },
    ]);

    const result = await inviteMembers("owner1", "cb1", [
      row("no"), // too short
      row("bob"),
    ]);

    if (result.ok) {
      expect(result.value[0].status).toBe("invalid");
      expect(result.value[1].status).toBe("invited");
    }
  });

  // OWNER is not grantable: Cookbook.ownerId is a scalar that a second OWNER
  // membership row would contradict.
  it("refuses to grant OWNER through an invite", async () => {
    repos.findManyByUsernames.mockResolvedValue([
      { id: "u_alice", username: "alice" },
    ]);

    const result = await inviteMembers("owner1", "cb1", [
      row("alice", "OWNER"),
    ]);

    if (result.ok) expect(result.value[0].status).toBe("invalid");
    expect(repos.inviteUpsert).not.toHaveBeenCalled();
  });

  it("returns outcomes in the order the rows were submitted", async () => {
    repos.findManyByUsernames.mockResolvedValue([
      { id: "u_bob", username: "bob" },
    ]);

    const result = await inviteMembers("owner1", "cb1", [
      row("ghost"),
      row("bob"),
      row("no"),
    ]);

    if (result.ok) {
      expect(result.value.map((o) => o.username)).toEqual([
        "ghost",
        "bob",
        "no",
      ]);
    }
  });
});

describe("acceptInvite", () => {
  const pending = {
    id: "inv1",
    cookbookId: "cb1",
    invitedUserId: "u_alice",
    role: "EDITOR",
    status: "PENDING",
    expiresAt: new Date(Date.now() + 86_400_000),
  };

  it("creates the membership from the invite's role", async () => {
    repos.inviteFindById.mockResolvedValue(pending);

    const result = await acceptInvite("u_alice", "inv1");

    expect(result.ok).toBe(true);
    expect(repos.accept).toHaveBeenCalledWith(
      "inv1",
      "u_alice",
      "cb1",
      "EDITOR",
    );
  });

  // The id comes from the client, so confirming that *some* invite exists at
  // that id would itself leak. Not-found, not forbidden.
  it("reads as not-found when the invite is addressed to someone else", async () => {
    repos.inviteFindById.mockResolvedValue(pending);

    const result = await acceptInvite("u_mallory", "inv1");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("not-found");
    expect(repos.accept).not.toHaveBeenCalled();
  });

  it("reads as not-found when there's no such invite", async () => {
    repos.inviteFindById.mockResolvedValue(null);

    const result = await acceptInvite("u_alice", "nope");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("not-found");
  });

  it("refuses an invite that was already answered", async () => {
    repos.inviteFindById.mockResolvedValue({ ...pending, status: "DECLINED" });

    const result = await acceptInvite("u_alice", "inv1");

    expect(result.ok).toBe(false);
    expect(repos.accept).not.toHaveBeenCalled();
  });

  it("refuses an expired invite even though its status is still PENDING", async () => {
    repos.inviteFindById.mockResolvedValue({
      ...pending,
      expiresAt: new Date(Date.now() - 1000),
    });

    const result = await acceptInvite("u_alice", "inv1");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/expired/i);
    expect(repos.accept).not.toHaveBeenCalled();
  });

  it("declines without creating a membership", async () => {
    repos.inviteFindById.mockResolvedValue(pending);

    const result = await declineInvite("u_alice", "inv1");

    expect(result.ok).toBe(true);
    expect(repos.decline).toHaveBeenCalledWith("inv1");
    expect(repos.accept).not.toHaveBeenCalled();
  });
});

describe("listPendingInvites", () => {
  it("flattens the invite rows and labels the sender", async () => {
    repos.listPendingForUser.mockResolvedValue([
      {
        id: "inv1",
        role: "VIEWER",
        createdAt: new Date(),
        cookbook: { id: "cb1", title: "Weeknight Dinners", description: "Fast." },
        invitedBy: { username: "chef_ryan", firstName: "Ryan", lastName: "K" },
      },
    ]);

    await expect(listPendingInvites("u_alice")).resolves.toEqual([
      {
        id: "inv1",
        cookbookId: "cb1",
        cookbookTitle: "Weeknight Dinners",
        cookbookDescription: "Fast.",
        role: "VIEWER",
        invitedByName: "chef_ryan",
      },
    ]);
  });

  it("returns an empty array — never null — when there are none", async () => {
    repos.listPendingForUser.mockResolvedValue([]);

    await expect(listPendingInvites("u1")).resolves.toEqual([]);
  });
});

describe("getCookbookMembers", () => {
  const members = [
    {
      role: "OWNER",
      createdAt: new Date(),
      user: {
        id: "owner1",
        username: "ryan",
        firstName: null,
        lastName: null,
        avatarUrl: null,
      },
    },
    {
      role: "VIEWER",
      createdAt: new Date(),
      user: {
        id: "u_alice",
        username: "alice",
        firstName: null,
        lastName: null,
        avatarUrl: null,
      },
    },
  ];

  beforeEach(() => {
    repos.listMembers.mockResolvedValue(members);
    repos.listPendingForCookbook.mockResolvedValue([]);
  });

  it("returns null for a non-member", async () => {
    repos.findMembership.mockResolvedValue(null);

    await expect(getCookbookMembers("u1", "cb1")).resolves.toBeNull();
    expect(repos.listMembers).not.toHaveBeenCalled();
  });

  it("marks the owner and the viewer themselves", async () => {
    const view = await getCookbookMembers("owner1", "cb1");

    expect(view?.members[0]).toMatchObject({
      userId: "owner1",
      isOwner: true,
      isSelf: true,
    });
    expect(view?.members[1]).toMatchObject({
      userId: "u_alice",
      isOwner: false,
      isSelf: false,
    });
  });

  // Everyone can see the roster; only a manager gets the controls.
  it("lets a VIEWER see members but not manage them", async () => {
    repos.findMembership.mockResolvedValue({ role: "VIEWER" });

    const view = await getCookbookMembers("u_alice", "cb1");

    expect(view?.members).toHaveLength(2);
    expect(view?.canManageMembers).toBe(false);
  });

  it("hides outstanding invites from someone who can't manage", async () => {
    repos.findMembership.mockResolvedValue({ role: "EDITOR" });

    const view = await getCookbookMembers("u_alice", "cb1");

    expect(view?.outstandingInvites).toEqual([]);
    expect(repos.listPendingForCookbook).not.toHaveBeenCalled();
  });

  it("labels an invite by username, or by email when there's no account", async () => {
    repos.listPendingForCookbook.mockResolvedValue([
      {
        id: "inv1",
        role: "EDITOR",
        email: null,
        createdAt: new Date(),
        invitedUser: { username: "bob", firstName: null, lastName: null },
      },
      {
        id: "inv2",
        role: "VIEWER",
        email: "carol@example.com",
        createdAt: new Date(),
        invitedUser: null,
      },
    ]);

    const view = await getCookbookMembers("owner1", "cb1");

    expect(view?.outstandingInvites.map((i) => i.name)).toEqual([
      "bob",
      "carol@example.com",
    ]);
  });
});

describe("changeMemberRole / removeMember", () => {
  it("refuses a non-owner", async () => {
    repos.findMembership.mockResolvedValue({ role: "EDITOR" });

    const result = await changeMemberRole("u1", "cb1", "u_alice", "EDITOR");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("forbidden");
    expect(repos.updateMemberRole).not.toHaveBeenCalled();
  });

  it("changes a member's role", async () => {
    const result = await changeMemberRole("owner1", "cb1", "u_alice", "EDITOR");

    expect(result.ok).toBe(true);
    expect(repos.updateMemberRole).toHaveBeenCalledWith(
      "cb1",
      "u_alice",
      "EDITOR",
    );
  });

  // Cookbook.ownerId is a scalar column that a demoted OWNER membership row
  // would contradict.
  it("refuses to demote the owner", async () => {
    const result = await changeMemberRole("owner1", "cb1", "owner1", "VIEWER");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("forbidden");
    expect(repos.updateMemberRole).not.toHaveBeenCalled();
  });

  it("refuses to remove the owner", async () => {
    const result = await removeMember("owner1", "cb1", "owner1");

    expect(result.ok).toBe(false);
    expect(repos.removeMember).not.toHaveBeenCalled();
  });

  it("removes a non-owner member", async () => {
    const result = await removeMember("owner1", "cb1", "u_alice");

    expect(result.ok).toBe(true);
    expect(repos.removeMember).toHaveBeenCalledWith("cb1", "u_alice");
  });

  it("refuses an unknown role", async () => {
    const result = await changeMemberRole("owner1", "cb1", "u_alice", "ADMIN");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("validation");
    expect(repos.updateMemberRole).not.toHaveBeenCalled();
  });

  it("refuses to promote a member to OWNER", async () => {
    const result = await changeMemberRole("owner1", "cb1", "u_alice", "OWNER");

    expect(result.ok).toBe(false);
    expect(repos.updateMemberRole).not.toHaveBeenCalled();
  });
});

describe("changeInviteRole / cancelInvite", () => {
  beforeEach(() => {
    repos.inviteFindById.mockResolvedValue({
      id: "inv1",
      cookbookId: "cb1",
      invitedUserId: "u_alice",
      role: "VIEWER",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 86_400_000),
    });
  });

  it("re-roles a pending invite", async () => {
    const result = await changeInviteRole("owner1", "inv1", "EDITOR");

    expect(result.ok).toBe(true);
    expect(repos.updateRole).toHaveBeenCalledWith("inv1", "EDITOR");
  });

  // Permission is checked against the cookbook the invite belongs to, which is
  // read from the invite — not supplied by the caller.
  it("refuses someone who doesn't manage the invite's cookbook", async () => {
    repos.findMembership.mockResolvedValue({ role: "VIEWER" });

    const result = await changeInviteRole("u_mallory", "inv1", "EDITOR");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("forbidden");
    expect(repos.updateRole).not.toHaveBeenCalled();
    expect(repos.findMembership).toHaveBeenCalledWith("cb1", "u_mallory");
  });

  it("withdraws an invite", async () => {
    const result = await cancelInvite("owner1", "inv1");

    expect(result.ok).toBe(true);
    expect(repos.remove).toHaveBeenCalledWith("inv1");
  });

  it("reads as not-found when the invite is gone", async () => {
    repos.inviteFindById.mockResolvedValue(null);

    const result = await cancelInvite("owner1", "nope");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("not-found");
  });
});

// ---------------------------------------------------------------------------
// The join link
// ---------------------------------------------------------------------------

describe("join link — owner controls", () => {
  // The same rule as inviting: widening who can see a cookbook is the owner's call.
  it.each([
    ["an editor", { role: "EDITOR" }],
    ["a viewer", { role: "VIEWER" }],
    ["a non-member", null],
  ])("refuses %s every control, and writes nothing", async (_who, membership) => {
    repos.findMembership.mockResolvedValue(membership);

    for (const result of [
      await setJoinLinkEnabled("u1", "cb1", true),
      await setJoinLinkRole("u1", "cb1", "EDITOR"),
      await resetJoinLink("u1", "cb1"),
    ]) {
      expect(result).toMatchObject({ ok: false, error: { kind: "forbidden" } });
    }
    expect(repos.setJoinLink).not.toHaveBeenCalled();
  });

  it("turns the link on with a fresh token, keeping the chosen role", async () => {
    repos.findJoinLink.mockResolvedValue({ joinLinkToken: null, joinLinkRole: "EDITOR" });

    const result = await setJoinLinkEnabled("owner1", "cb1", true);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.role).toBe("EDITOR");
    // URL-safe and long enough to be unguessable.
    expect(result.value.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("leaves a link that's already on with the URL it had", async () => {
    repos.findJoinLink.mockResolvedValue({ joinLinkToken: "existing", joinLinkRole: "VIEWER" });

    const result = await setJoinLinkEnabled("owner1", "cb1", true);

    expect(result).toMatchObject({ ok: true, value: { token: "existing" } });
  });

  it("turns the link off by dropping its token, and remembers the role", async () => {
    repos.findJoinLink.mockResolvedValue({ joinLinkToken: "existing", joinLinkRole: "EDITOR" });

    await setJoinLinkEnabled("owner1", "cb1", false);

    expect(repos.setJoinLink).toHaveBeenCalledWith("cb1", { token: null, role: "EDITOR" });
  });

  // Anyone who kept the old URL from before it was turned off must stay out.
  it("never revives an old URL when a link is turned back on", async () => {
    repos.findJoinLink.mockResolvedValueOnce({ joinLinkToken: "old", joinLinkRole: "VIEWER" });
    await setJoinLinkEnabled("owner1", "cb1", false);

    repos.findJoinLink.mockResolvedValueOnce({ joinLinkToken: null, joinLinkRole: "VIEWER" });
    const result = await setJoinLinkEnabled("owner1", "cb1", true);

    expect(result.ok && result.value.token).not.toBe("old");
  });

  it("changes the role without changing the URL", async () => {
    repos.findJoinLink.mockResolvedValue({ joinLinkToken: "existing", joinLinkRole: "VIEWER" });

    const result = await setJoinLinkRole("owner1", "cb1", "EDITOR");

    expect(result).toMatchObject({ ok: true, value: { token: "existing", role: "EDITOR" } });
  });

  // A link must never be a way to hand out ownership.
  it.each(["OWNER", "ADMIN", ""])("refuses to make the link grant %j", async (role) => {
    const result = await setJoinLinkRole("owner1", "cb1", role);

    expect(result).toMatchObject({ ok: false, error: { kind: "validation" } });
    expect(repos.setJoinLink).not.toHaveBeenCalled();
  });

  it("resets to a new URL, so the old one stops working", async () => {
    repos.findJoinLink.mockResolvedValue({ joinLinkToken: "leaked", joinLinkRole: "EDITOR" });

    const result = await resetJoinLink("owner1", "cb1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.token).not.toBe("leaked");
    expect(result.value.role).toBe("EDITOR");
  });

  it("won't reset a link that's turned off", async () => {
    const result = await resetJoinLink("owner1", "cb1");

    expect(result).toMatchObject({ ok: false, error: { kind: "validation" } });
    expect(repos.setJoinLink).not.toHaveBeenCalled();
  });

  it("reports a cookbook that has gone as not found", async () => {
    repos.findJoinLink.mockResolvedValue(null);

    expect(await setJoinLinkEnabled("owner1", "cb1", true)).toMatchObject({ ok: false, error: { kind: "not-found" } });
    expect(await setJoinLinkRole("owner1", "cb1", "EDITOR")).toMatchObject({ ok: false, error: { kind: "not-found" } });
    expect(await resetJoinLink("owner1", "cb1")).toMatchObject({ ok: false, error: { kind: "not-found" } });
  });
});

describe("join link — in the members view", () => {
  beforeEach(() => {
    repos.listMembers.mockResolvedValue([]);
    repos.listPendingForCookbook.mockResolvedValue([]);
  });

  it("shows the owner the link, since they control it", async () => {
    repos.findJoinLink.mockResolvedValue({ joinLinkToken: "tok", joinLinkRole: "EDITOR" });

    const view = await getCookbookMembers("owner1", "cb1");

    expect(view!.joinLink).toEqual({ token: "tok", role: "EDITOR" });
  });

  // The token is itself the permission to join; it isn't everyone's to pass on.
  it("hides the link from everyone else", async () => {
    repos.findMembership.mockResolvedValue({ role: "EDITOR" });

    const view = await getCookbookMembers("u1", "cb1");

    expect(view!.joinLink).toBeNull();
    expect(repos.findJoinLink).not.toHaveBeenCalled();
  });
});

const linkedCookbook = {
  id: "cb1",
  title: "Weeknight Dinners",
  description: "What we actually cook.",
  joinLinkRole: "EDITOR",
  coverImageUrl: null,
  coverColor: 3,
  coverStyle: "TITLED",
  coverTexture: "NONE",
  coverTitleFont: "SERIF",
  coverTitleSize: "MEDIUM",
  coverTitlePosition: "CENTER",
  coverFocalX: 0.5,
  coverFocalY: 0.5,
  coverZoom: 1,
  owner: { username: "ryan", firstName: "Ryan", lastName: null },
  _count: { members: 3 },
};

describe("join link — previewing and joining", () => {
  it("previews what the link opens, for someone not yet signed in", async () => {
    repos.findByJoinToken.mockResolvedValue(linkedCookbook);

    const preview = await previewJoinLink("tok");

    expect(preview).toMatchObject({
      cookbookId: "cb1",
      title: "Weeknight Dinners",
      role: "EDITOR",
      memberCount: 3,
      design: { coverColor: 3, coverStyle: "TITLED" },
    });
    expect(preview!.ownerName).toBe("ryan");
  });

  it("doesn't look anyone up for a visitor who isn't signed in", async () => {
    repos.findByJoinToken.mockResolvedValue(linkedCookbook);

    const preview = await previewJoinLink("tok");

    expect(preview!.alreadyMember).toBe(false);
    expect(repos.findMembership).not.toHaveBeenCalled();
  });

  it("says when the person looking is already in the cookbook", async () => {
    repos.findByJoinToken.mockResolvedValue(linkedCookbook);
    repos.findMembership.mockResolvedValue({ role: "EDITOR" });

    expect((await previewJoinLink("tok", "u2"))!.alreadyMember).toBe(true);
    expect(repos.findMembership).toHaveBeenCalledWith("cb1", "u2");
  });

  it("says when they aren't", async () => {
    repos.findByJoinToken.mockResolvedValue(linkedCookbook);
    repos.findMembership.mockResolvedValue(null);

    expect((await previewJoinLink("tok", "u2"))!.alreadyMember).toBe(false);
  });

  it("has nothing to preview for a dead link", async () => {
    repos.findByJoinToken.mockResolvedValue(null);
    expect(await previewJoinLink("gone")).toBeNull();
  });

  it("joins with the role the link grants", async () => {
    repos.findByJoinToken.mockResolvedValue(linkedCookbook);

    const result = await joinWithLink("u2", "tok");

    expect(result).toEqual({ ok: true, value: { cookbookId: "cb1" } });
    expect(repos.joinByLink).toHaveBeenCalledWith("cb1", "u2", "EDITOR");
  });

  // The page may have been open while the owner reset or turned off the link.
  it("refuses a link that stopped working after the page was shown", async () => {
    repos.findByJoinToken.mockResolvedValue(null);

    const result = await joinWithLink("u2", "tok");

    expect(result).toMatchObject({ ok: false, error: { kind: "not-found" } });
    if (!result.ok) expect(result.error.message).toMatch(/ask .* for a new one/i);
    expect(repos.joinByLink).not.toHaveBeenCalled();
  });

  // Should a stored role ever be something a link may not grant, it grants the
  // least rather than trusting the column.
  it("never grants more than Editor, whatever the column holds", async () => {
    repos.findByJoinToken.mockResolvedValue({ ...linkedCookbook, joinLinkRole: "OWNER" });

    await joinWithLink("u2", "tok");

    expect(repos.joinByLink).toHaveBeenCalledWith("cb1", "u2", "VIEWER");
  });
});

// ---------------------------------------------------------------------------
// One-time links
// ---------------------------------------------------------------------------

const NOW = new Date("2026-09-22T12:00:00Z");
const inDays = (days: number) => new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);

describe("createOneTimeLink", () => {
  beforeEach(() => {
    repos.createLink.mockImplementation(async (input: { role: string; label: string | null; expiresAt: Date }) => ({
      id: "inv9",
      token: "once",
      role: input.role,
      label: input.label,
      expiresAt: input.expiresAt,
    }));
  });

  it("makes a link for one person, as the owner, that lasts a week", async () => {
    const result = await createOneTimeLink("owner1", "cb1", "EDITOR", "  Mum ", NOW);

    expect(repos.createLink).toHaveBeenCalledWith({
      cookbookId: "cb1",
      invitedById: "owner1",
      role: "EDITOR",
      expiresAt: inDays(7),
      label: "Mum",
    });
    expect(result).toEqual({
      ok: true,
      value: { id: "inv9", token: "once", role: "EDITOR", label: "Mum", daysLeft: 7 },
    });
  });

  it("treats a blank label as none", async () => {
    await createOneTimeLink("owner1", "cb1", "VIEWER", "   ", NOW);
    expect(repos.createLink.mock.calls[0][0].label).toBeNull();
  });

  it.each([
    ["an editor", { role: "EDITOR" }],
    ["a non-member", null],
  ])("refuses %s, and creates nothing", async (_who, membership) => {
    repos.findMembership.mockResolvedValue(membership);

    const result = await createOneTimeLink("u1", "cb1", "VIEWER", "", NOW);

    expect(result).toMatchObject({ ok: false, error: { kind: "forbidden" } });
    expect(repos.createLink).not.toHaveBeenCalled();
  });

  it("never makes a link that grants Owner", async () => {
    const result = await createOneTimeLink("owner1", "cb1", "OWNER", "", NOW);
    expect(result).toMatchObject({ ok: false, error: { kind: "validation" } });
    expect(repos.createLink).not.toHaveBeenCalled();
  });

  it("refuses a label too long to read at a glance", async () => {
    const result = await createOneTimeLink("owner1", "cb1", "VIEWER", "x".repeat(41), NOW);
    expect(result).toMatchObject({ ok: false, error: { kind: "validation", message: expect.stringMatching(/40/) } });
  });
});

describe("one-time links — in the members view", () => {
  beforeEach(() => {
    repos.listMembers.mockResolvedValue([]);
    repos.listPendingForCookbook.mockResolvedValue([]);
  });

  it("lists the owner's unused links, with how long each has left", async () => {
    repos.listPendingLinks.mockResolvedValue([
      { id: "inv9", token: "once", role: "EDITOR", label: "Mum", expiresAt: new Date(Date.now() + 36 * 60 * 60 * 1000) },
    ]);

    const view = await getCookbookMembers("owner1", "cb1");

    expect(view!.oneTimeLinks).toEqual([
      { id: "inv9", token: "once", role: "EDITOR", label: "Mum", daysLeft: 2 },
    ]);
  });

  it("shows no one else the links, and doesn't look them up", async () => {
    repos.findMembership.mockResolvedValue({ role: "VIEWER" });

    const view = await getCookbookMembers("u1", "cb1");

    expect(view!.oneTimeLinks).toEqual([]);
    expect(repos.listPendingLinks).not.toHaveBeenCalled();
  });
});

const oneTimeInvite = {
  id: "inv9",
  role: "VIEWER",
  cookbook: linkedCookbook,
};

describe("one-time links — previewing and joining", () => {
  it("previews a one-time link as single-use", async () => {
    repos.findByJoinToken.mockResolvedValue(null);
    repos.findPendingLinkByToken.mockResolvedValue(oneTimeInvite);

    const preview = await previewJoinLink("once");

    // The invite's own role, not the cookbook's shared-link role.
    expect(preview).toMatchObject({ cookbookId: "cb1", role: "VIEWER", singleUse: true });
  });

  it("says the shared link is reusable", async () => {
    repos.findByJoinToken.mockResolvedValue(linkedCookbook);

    expect((await previewJoinLink("tok"))!.singleUse).toBe(false);
    expect(repos.findPendingLinkByToken).not.toHaveBeenCalled();
  });

  it("claims the link for the person joining, with its role", async () => {
    repos.findByJoinToken.mockResolvedValue(null);
    repos.findPendingLinkByToken.mockResolvedValue(oneTimeInvite);
    repos.findMembership.mockResolvedValue(null);

    const result = await joinWithLink("u2", "once");

    expect(result).toEqual({ ok: true, value: { cookbookId: "cb1" } });
    expect(repos.claimLink).toHaveBeenCalledWith("inv9", "u2", "cb1", "VIEWER");
    expect(repos.joinByLink).not.toHaveBeenCalled();
  });

  // The owner checking a link before sending it mustn't use it up.
  it("doesn't spend the link on someone already in the cookbook", async () => {
    repos.findByJoinToken.mockResolvedValue(null);
    repos.findPendingLinkByToken.mockResolvedValue(oneTimeInvite);
    repos.findMembership.mockResolvedValue({ role: "OWNER" });

    const result = await joinWithLink("owner1", "once");

    expect(result).toEqual({ ok: true, value: { cookbookId: "cb1" } });
    expect(repos.claimLink).not.toHaveBeenCalled();
  });

  // Two people pressing Join at once: the claim, not the lookup, decides.
  it("turns away whoever loses the race to use it", async () => {
    repos.findByJoinToken.mockResolvedValue(null);
    repos.findPendingLinkByToken.mockResolvedValue(oneTimeInvite);
    repos.findMembership.mockResolvedValue(null);
    repos.claimLink.mockResolvedValue(false);

    const result = await joinWithLink("u3", "once");

    expect(result).toMatchObject({ ok: false, error: { kind: "not-found" } });
  });

  it("treats a used, revoked or expired one-time link as dead", async () => {
    repos.findByJoinToken.mockResolvedValue(null);
    repos.findPendingLinkByToken.mockResolvedValue(null);

    expect(await previewJoinLink("spent")).toBeNull();
    expect(await joinWithLink("u2", "spent")).toMatchObject({ ok: false, error: { kind: "not-found" } });
  });
});
