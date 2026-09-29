import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Prisma boundary. Each query builder returns a tagged object so the
// test can read the transaction's contents, in order, without a database.
const prisma = vi.hoisted(() => {
  const tag =
    (name: string) =>
    (arg: unknown) => ({ op: name, arg });
  return {
    $transaction: vi.fn(async (ops: unknown[]) => ops),
    cookbook: { update: vi.fn(tag("cookbook.update")), deleteMany: vi.fn(tag("cookbook.deleteMany")) },
    cookbookMember: { update: vi.fn(tag("cookbookMember.update")) },
    recipe: { deleteMany: vi.fn(tag("recipe.deleteMany")) },
    user: { delete: vi.fn(tag("user.delete")), findUnique: vi.fn() },
  };
});
vi.mock("@/lib/prisma", () => ({ prisma }));

import { accountRepository } from "./account.repository";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("accountRepository.deleteAccount", () => {
  it("moves ownership first and deletes the user last, in one transaction", async () => {
    const ops = (await accountRepository.deleteAccount({
      userId: "me",
      transfers: [{ cookbookId: "shared", heirId: "eddie" }],
      deleteCookbookIds: ["solo"],
      deleteRecipeIds: ["r1"],
    })) as unknown as { op: string; arg: unknown }[];

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(ops.map((o) => o.op)).toEqual([
      "cookbook.update",
      "cookbookMember.update",
      "recipe.deleteMany",
      "cookbook.deleteMany",
      "user.delete",
    ]);
    expect(ops[0].arg).toEqual({
      where: { id: "shared" },
      data: { ownerId: "eddie" },
    });
    expect(ops[1].arg).toEqual({
      where: { cookbookId_userId: { cookbookId: "shared", userId: "eddie" } },
      data: { role: "OWNER" },
    });
    expect(ops[4].arg).toEqual({ where: { id: "me" } });
  });
});

describe("accountRepository.findFootprint", () => {
  it("leaves the owner out of their own cookbooks' member lists", async () => {
    await accountRepository.findFootprint("me");

    const arg = prisma.user.findUnique.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "me" });
    expect(arg.select.ownedCookbooks.select.members.where).toEqual({
      userId: { not: "me" },
    });
    expect(arg.select.ownedCookbooks.select.members.orderBy).toEqual({
      createdAt: "asc",
    });
  });
});
