import { describe, it, expect, vi, beforeEach } from "vitest";

const { getUser, deleteUser, deleteAccount, deleteImages } = vi.hoisted(() => ({
  getUser: vi.fn(),
  deleteUser: vi.fn(),
  deleteAccount: vi.fn(),
  deleteImages: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({ users: { getUser, deleteUser } }),
}));
vi.mock("@clerk/nextjs/errors", () => ({
  isClerkAPIResponseError: (e: { clerkError?: boolean }) => Boolean(e?.clerkError),
}));
vi.mock("@/server/services/account.service", () => ({ deleteAccount }));
vi.mock("@/server/blob", () => ({ deleteImages }));

import { clerkUserIsGone, deleteOwnAccount, removeAccountData } from "./account";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  deleteAccount.mockResolvedValue({ orphanedImages: [] });
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

describe("deleteOwnAccount", () => {
  const user = { id: "u1", clerkId: "clerk_1" };

  it("deletes our data with their choice, then the Clerk user", async () => {
    expect(await deleteOwnAccount(user, { keepRecipes: false })).toEqual({ ok: true });

    expect(deleteAccount).toHaveBeenCalledWith("u1", { keepRecipes: false });
    expect(deleteUser).toHaveBeenCalledWith("clerk_1");
    expect(deleteAccount.mock.invocationCallOrder[0]).toBeLessThan(
      deleteUser.mock.invocationCallOrder[0],
    );
  });

  it("leaves the Clerk user alone if our delete fails", async () => {
    deleteAccount.mockRejectedValue(new Error("db down"));

    expect(await deleteOwnAccount(user, { keepRecipes: true })).toEqual({
      ok: false,
      failed: "data",
    });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("reports the sign-in as left behind when the Clerk delete fails", async () => {
    deleteUser.mockRejectedValue({ clerkError: true, status: 500 });

    expect(await deleteOwnAccount(user, { keepRecipes: true })).toEqual({
      ok: false,
      failed: "sign-in",
    });
  });

  it("counts a Clerk user that's already gone as done", async () => {
    deleteUser.mockRejectedValue({ clerkError: true, status: 404 });

    expect(await deleteOwnAccount(user, { keepRecipes: true })).toEqual({ ok: true });
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
