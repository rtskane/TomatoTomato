import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Prisma boundary so we assert *how* the repository calls it, without
// a database. vi.hoisted lets the mock factory reference these safely.
const { cookbook, cookbookMember } = vi.hoisted(() => ({
  cookbook: { create: vi.fn() },
  cookbookMember: { findMany: vi.fn(), findUnique: vi.fn() },
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

describe("cookbookRepository.findDetailForUser", () => {
  beforeEach(() => {
    cookbookMember.findUnique.mockResolvedValue(null);
  });

  // The cookbook id comes from the URL here, so it's attacker-controlled. The
  // composite-key lookup is what makes a forged id find nothing.
  it("looks up the membership composite key, not the cookbook", async () => {
    await cookbookRepository.findDetailForUser("cb1", "u1");

    expect(cookbookMember.findUnique.mock.calls[0][0].where).toEqual({
      cookbookId_userId: { cookbookId: "cb1", userId: "u1" },
    });
  });

  it("returns null for a non-member rather than leaking the cookbook", async () => {
    await expect(
      cookbookRepository.findDetailForUser("cb1", "stranger"),
    ).resolves.toBeNull();
  });

  it("selects the role and the recipe fields the page renders", async () => {
    await cookbookRepository.findDetailForUser("cb1", "u1");

    const select = cookbookMember.findUnique.mock.calls[0][0].select;
    expect(select.role).toBe(true);
    expect(select.cookbook.select).toMatchObject({ id: true, title: true });

    const recipes = select.cookbook.select.recipes;
    expect(recipes.orderBy).toEqual({ createdAt: "desc" });
    expect(recipes.select._count).toEqual({
      select: { ingredients: true, steps: true },
    });
    expect(recipes.select.author.select).toMatchObject({ username: true });
  });
});

describe("cookbookRepository.findMembership", () => {
  beforeEach(() => {
    cookbookMember.findUnique.mockResolvedValue({ role: "EDITOR" });
  });

  it("looks up by the composite key", async () => {
    await cookbookRepository.findMembership("cb1", "u1");

    expect(cookbookMember.findUnique.mock.calls[0][0].where).toEqual({
      cookbookId_userId: { cookbookId: "cb1", userId: "u1" },
    });
  });

  it("selects only the role", async () => {
    await cookbookRepository.findMembership("cb1", "u1");

    expect(cookbookMember.findUnique.mock.calls[0][0].select).toEqual({
      role: true,
    });
  });

  it("returns null when there is no membership", async () => {
    cookbookMember.findUnique.mockResolvedValue(null);

    await expect(
      cookbookRepository.findMembership("cb1", "stranger"),
    ).resolves.toBeNull();
  });
});
