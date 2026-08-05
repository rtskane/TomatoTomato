import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Prisma boundary so we assert *how* the repository calls it, without
// a database. vi.hoisted lets the mock factory reference these safely.
const { cookbook, cookbookMember } = vi.hoisted(() => ({
  cookbook: { create: vi.fn() },
  cookbookMember: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: { cookbook, cookbookMember } }));

import { cookbookRepository } from "./cookbook.repository";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cookbookRepository.create", () => {
  const input = {
    ownerId: "u1",
    title: "Weeknight Dinners",
    description: "Fast meals.",
  };

  it("writes the cookbook fields", async () => {
    cookbook.create.mockResolvedValue({ id: "cb1" });

    await cookbookRepository.create(input);

    const arg = cookbook.create.mock.calls[0][0];
    expect(arg.data).toMatchObject({
      title: "Weeknight Dinners",
      description: "Fast meals.",
      ownerId: "u1",
    });
  });

  // The invariant the dashboard listing depends on: a cookbook is never created
  // without its owner's membership row, so membership alone answers "who can
  // see this?" without unioning ownedCookbooks.
  it("creates the owner's OWNER membership row in the same nested write", async () => {
    cookbook.create.mockResolvedValue({ id: "cb1" });

    await cookbookRepository.create(input);

    const arg = cookbook.create.mock.calls[0][0];
    expect(arg.data.members).toEqual({
      create: { userId: "u1", role: "OWNER" },
    });
    // One call — a nested create is atomic; no second round trip that could
    // leave a cookbook without its membership.
    expect(cookbook.create).toHaveBeenCalledOnce();
  });

  it("passes a null description straight through", async () => {
    cookbook.create.mockResolvedValue({ id: "cb1" });

    await cookbookRepository.create({ ...input, description: null });

    expect(cookbook.create.mock.calls[0][0].data.description).toBeNull();
  });

  it("returns the created row", async () => {
    cookbook.create.mockResolvedValue({ id: "cb1", title: "Weeknight Dinners" });

    await expect(cookbookRepository.create(input)).resolves.toEqual({
      id: "cb1",
      title: "Weeknight Dinners",
    });
  });

  it("rethrows unexpected errors unchanged", async () => {
    const boom = new Error("connection lost");
    cookbook.create.mockRejectedValue(boom);

    await expect(cookbookRepository.create(input)).rejects.toBe(boom);
  });
});

describe("cookbookRepository.listForUser", () => {
  beforeEach(() => {
    cookbookMember.findMany.mockResolvedValue([]);
  });

  // The counterpart to the invariant above: because create() always writes the
  // owner's membership row, reading membership alone is complete.
  it("queries membership only — never unions ownedCookbooks", async () => {
    await cookbookRepository.listForUser("u1");

    expect(cookbookMember.findMany).toHaveBeenCalledOnce();
    expect(cookbook.create).not.toHaveBeenCalled();
  });

  it("scopes the query to the given user", async () => {
    await cookbookRepository.listForUser("u1");

    expect(cookbookMember.findMany.mock.calls[0][0].where).toEqual({
      userId: "u1",
    });
  });

  it("orders by the cookbook's updatedAt, newest first", async () => {
    await cookbookRepository.listForUser("u1");

    expect(cookbookMember.findMany.mock.calls[0][0].orderBy).toEqual({
      cookbook: { updatedAt: "desc" },
    });
  });

  it("selects the role plus the fields the dashboard renders", async () => {
    await cookbookRepository.listForUser("u1");

    const select = cookbookMember.findMany.mock.calls[0][0].select;
    expect(select.role).toBe(true);
    expect(select.cookbook.select).toMatchObject({
      id: true,
      title: true,
      description: true,
    });
    expect(select.cookbook.select._count).toEqual({
      select: { recipes: true, members: true },
    });
  });

  it("returns an empty array when the user has no memberships", async () => {
    await expect(cookbookRepository.listForUser("u1")).resolves.toEqual([]);
  });
});
