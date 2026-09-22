import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Prisma boundary: these tests pin *how* the repository asks, which
// is where the one-time link's guarantees live.
const { cookbookInvite, cookbookMember, $transaction } = vi.hoisted(() => ({
  cookbookInvite: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  },
  cookbookMember: { upsert: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { cookbookInvite, cookbookMember, $transaction },
}));

import { inviteRepository } from "./invite.repository";

const NOW = new Date("2026-09-22T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  // An interactive transaction hands its callback a client; ours is the mock.
  $transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({ cookbookInvite, cookbookMember }),
  );
});

describe("inviteRepository — one-time links", () => {
  it("creates a link addressed to no one, with a fresh URL-safe token", async () => {
    await inviteRepository.createLink({
      cookbookId: "cb1",
      invitedById: "owner1",
      role: "EDITOR",
      expiresAt: NOW,
      label: "Mum",
    });

    const { data } = cookbookInvite.create.mock.calls[0][0];
    expect(data).toMatchObject({
      cookbookId: "cb1",
      invitedById: "owner1",
      role: "EDITOR",
      expiresAt: NOW,
      label: "Mum",
      invitedUserId: null,
      email: null,
    });
    expect(data.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("lists only a cookbook's unused, unexpired links", async () => {
    await inviteRepository.listPendingLinks("cb1", NOW);

    expect(cookbookInvite.findMany.mock.calls[0][0].where).toEqual({
      cookbookId: "cb1",
      status: "PENDING",
      expiresAt: { gt: NOW },
      invitedUserId: null,
      email: null,
    });
  });

  // Each would otherwise appear as "Unknown" among the people waiting.
  it("keeps links out of the list of people invited", async () => {
    await inviteRepository.listPendingForCookbook("cb1", NOW);

    expect(cookbookInvite.findMany.mock.calls[0][0].where.NOT).toEqual({
      invitedUserId: null,
      email: null,
    });
  });

  // An in-app invite's token is never handed out, so it must not work as a link.
  it("opens only an unused link to a live cookbook", async () => {
    await inviteRepository.findPendingLinkByToken("once", NOW);

    expect(cookbookInvite.findFirst.mock.calls[0][0].where).toEqual({
      token: "once",
      status: "PENDING",
      expiresAt: { gt: NOW },
      invitedUserId: null,
      email: null,
      cookbook: { archivedAt: null },
    });
  });

  describe("claimLink", () => {
    it("claims only a link that's still unused, in the same statement", async () => {
      cookbookInvite.updateMany.mockResolvedValueOnce({ count: 1 });

      expect(await inviteRepository.claimLink("inv9", "u2", "cb1", "VIEWER", NOW)).toBe(true);

      expect(cookbookInvite.updateMany.mock.calls[0][0]).toEqual({
        where: { id: "inv9", status: "PENDING", expiresAt: { gt: NOW } },
        data: { status: "ACCEPTED" },
      });
    });

    it("adds the member without changing anyone already in, and settles their invites", async () => {
      cookbookInvite.updateMany.mockResolvedValueOnce({ count: 1 });

      await inviteRepository.claimLink("inv9", "u2", "cb1", "VIEWER", NOW);

      expect(cookbookMember.upsert.mock.calls[0][0]).toEqual({
        where: { cookbookId_userId: { cookbookId: "cb1", userId: "u2" } },
        create: { cookbookId: "cb1", userId: "u2", role: "VIEWER" },
        update: {},
      });
      expect(cookbookInvite.updateMany.mock.calls[1][0]).toEqual({
        where: { cookbookId: "cb1", invitedUserId: "u2", status: "PENDING" },
        data: { status: "ACCEPTED" },
      });
    });

    // The loser of a race to use the same link: nothing matched, nothing written.
    it("adds no one when the link was already used", async () => {
      cookbookInvite.updateMany.mockResolvedValueOnce({ count: 0 });

      expect(await inviteRepository.claimLink("inv9", "u3", "cb1", "VIEWER", NOW)).toBe(false);
      expect(cookbookMember.upsert).not.toHaveBeenCalled();
      expect(cookbookInvite.updateMany).toHaveBeenCalledTimes(1);
    });
  });
});
