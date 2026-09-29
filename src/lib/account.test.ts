import { describe, it, expect, vi, beforeEach } from "vitest";

const { getUser, deleteAccount, deleteImages } = vi.hoisted(() => ({
  getUser: vi.fn(),
  deleteAccount: vi.fn(),
  deleteImages: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({ users: { getUser } }),
}));
vi.mock("@clerk/nextjs/errors", () => ({
  isClerkAPIResponseError: (e: { clerkError?: boolean }) => Boolean(e?.clerkError),
}));
vi.mock("@/server/services/account.service", () => ({ deleteAccount }));
vi.mock("@/server/blob", () => ({ deleteImages }));

import { clerkUserIsGone, removeAccountData } from "./account";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("removeAccountData", () => {
  it("deletes the rows, then the files they pointed at", async () => {
    deleteAccount.mockResolvedValue({ orphanedImages: ["a", "b"] });

    await removeAccountData("u1", { keepRecipes: false });

    expect(deleteAccount).toHaveBeenCalledWith("u1", { keepRecipes: false });
    expect(deleteImages).toHaveBeenCalledWith(["a", "b"]);
  });

  it("leaves the files alone if the rows couldn't be deleted", async () => {
    deleteAccount.mockRejectedValue(new Error("db down"));

    await expect(removeAccountData("u1", { keepRecipes: true })).rejects.toThrow();
    expect(deleteImages).not.toHaveBeenCalled();
  });
});

describe("clerkUserIsGone", () => {
  it("is true only when Clerk answers 404", async () => {
    getUser.mockRejectedValue({ clerkError: true, status: 404 });
    expect(await clerkUserIsGone("clerk_1")).toBe(true);
  });

  it("is false while the user exists", async () => {
    getUser.mockResolvedValue({ id: "clerk_1" });
    expect(await clerkUserIsGone("clerk_1")).toBe(false);
  });

  // An outage mustn't read as "deleted" — that would clear a live account.
  it("is false when Clerk fails any other way", async () => {
    getUser.mockRejectedValue({ clerkError: true, status: 500 });
    expect(await clerkUserIsGone("clerk_1")).toBe(false);

    getUser.mockRejectedValue(new Error("network"));
    expect(await clerkUserIsGone("clerk_1")).toBe(false);
  });
});
