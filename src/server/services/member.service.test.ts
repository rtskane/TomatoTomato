import { describe, it, expect, vi, beforeEach } from "vitest";

// Fully replace the repository modules so real Prisma is never imported.
const repos = vi.hoisted(() => ({
  findMembership: vi.fn(),
  findById: vi.fn(),
  listMembers: vi.fn(),
  updateMemberRole: vi.fn(),
  removeMember: vi.fn(),
  findJoinLink: vi.fn(),
  setJoinLink: vi.fn(),
  findByJoinToken: vi.fn(),
  joinByLink: vi.fn(),
  createLink: vi.fn(),
  listPendingLinks: vi.fn(),
  findLinkById: vi.fn(),
  findPendingLinkByToken: vi.fn(),
  claimLink: vi.fn(),
  revokeLink: vi.fn(),
}));

vi.mock("@/server/repositories/cookbook.repository", () => ({
  cookbookRepository: {
    findMembership: repos.findMembership,
    findById: repos.findById,
    listMembers: repos.listMembers,
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
    createLink: repos.createLink,
    listPendingLinks: repos.listPendingLinks,
    findLinkById: repos.findLinkById,
    findPendingLinkByToken: repos.findPendingLinkByToken,
    claimLink: repos.claimLink,
    revokeLink: repos.revokeLink,
  },
}));

import {
  getCookbookMembers,
  changeMemberRole,
  removeMember,
  setJoinLinkEnabled,
  setJoinLinkRole,
  resetJoinLink,
  previewJoinLink,
  joinWithLink,
  createOneTimeLink,
  revokeOneTimeLink,
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

describe("revokeOneTimeLink", () => {
  beforeEach(() => {
    repos.findLinkById.mockResolvedValue({ id: "inv9", cookbookId: "cb1" });
  });

  it("deletes an unused link, as the owner", async () => {
    expect(await revokeOneTimeLink("owner1", "inv9")).toEqual({ ok: true, value: true });
    expect(repos.revokeLink).toHaveBeenCalledWith("inv9");
  });

  // Permission is checked against the cookbook the link belongs to, which is
  // read from the link — not supplied by the caller.
  it("refuses someone who doesn't manage the link's cookbook", async () => {
    repos.findMembership.mockResolvedValue({ role: "VIEWER" });

    const result = await revokeOneTimeLink("u_mallory", "inv9");

    expect(result).toMatchObject({ ok: false, error: { kind: "forbidden" } });
    expect(repos.findMembership).toHaveBeenCalledWith("cb1", "u_mallory");
    expect(repos.revokeLink).not.toHaveBeenCalled();
  });

  it("reads as not-found when the link is gone", async () => {
    repos.findLinkById.mockResolvedValue(null);

    expect(await revokeOneTimeLink("owner1", "nope")).toMatchObject({
      ok: false,
      error: { kind: "not-found" },
    });
  });
});
