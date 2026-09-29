import { describe, it, expect, vi, beforeEach } from "vitest";

const { ensureUser, removeAccountData, deleteUser, getAccountDeletionPreview } =
  vi.hoisted(() => ({
    ensureUser: vi.fn(),
    removeAccountData: vi.fn(),
    deleteUser: vi.fn(),
    getAccountDeletionPreview: vi.fn(),
  }));
vi.mock("@/lib/user", () => ({ ensureUser }));
vi.mock("@/lib/account", () => ({ removeAccountData }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({ users: { deleteUser } }),
}));
vi.mock("@clerk/nextjs/errors", () => ({
  isClerkAPIResponseError: (e: { clerkError?: boolean }) => Boolean(e?.clerkError),
}));
vi.mock("@/server/services/account.service", () => ({
  getAccountDeletionPreview,
}));

import { deleteAccountAction, loadAccountDeletionPreview } from "./actions";

function formOf(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  ensureUser.mockResolvedValue({ id: "u1", clerkId: "clerk_1" });
});

describe("loadAccountDeletionPreview", () => {
  it("previews the signed-in user's own account", async () => {
    getAccountDeletionPreview.mockResolvedValue({ handedOver: [] });

    expect(await loadAccountDeletionPreview()).toEqual({ handedOver: [] });
    expect(getAccountDeletionPreview).toHaveBeenCalledWith("u1");
  });

  it("is null when signed out", async () => {
    ensureUser.mockResolvedValue(null);
    expect(await loadAccountDeletionPreview()).toBeNull();
  });
});

describe("deleteAccountAction", () => {
  it("deletes our data with their choice, then the Clerk user", async () => {
    const state = await deleteAccountAction({}, formOf({ recipes: "delete" }));

    expect(removeAccountData).toHaveBeenCalledWith("u1", { keepRecipes: false });
    expect(deleteUser).toHaveBeenCalledWith("clerk_1");
    expect(removeAccountData.mock.invocationCallOrder[0]).toBeLessThan(
      deleteUser.mock.invocationCallOrder[0],
    );
    expect(state).toEqual({ deleted: true });
  });

  it("keeps their recipes when they said to", async () => {
    await deleteAccountAction({}, formOf({ recipes: "keep" }));
    expect(removeAccountData).toHaveBeenCalledWith("u1", { keepRecipes: true });
  });

  // No question is asked when they have no recipes in shared cookbooks.
  it("keeps recipes when no answer was given", async () => {
    await deleteAccountAction({}, formOf({}));
    expect(removeAccountData).toHaveBeenCalledWith("u1", { keepRecipes: true });
  });

  it("says so when the Clerk delete fails, so they can try again", async () => {
    deleteUser.mockRejectedValue({ clerkError: true, status: 500 });

    const state = await deleteAccountAction({}, formOf({ recipes: "keep" }));

    expect(state.error).toMatch(/couldn't close your sign-in/);
    expect(state.deleted).toBeUndefined();
  });

  it("leaves the Clerk user alone if our delete fails", async () => {
    removeAccountData.mockRejectedValueOnce(new Error("db down"));

    const state = await deleteAccountAction({}, formOf({}));

    expect(state.error).toMatch(/nothing was deleted/);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("counts a Clerk user that's already gone as done", async () => {
    deleteUser.mockRejectedValue({ clerkError: true, status: 404 });

    expect(await deleteAccountAction({}, formOf({}))).toEqual({ deleted: true });
  });

  it("does nothing when signed out", async () => {
    ensureUser.mockResolvedValue(null);

    const state = await deleteAccountAction({}, formOf({}));

    expect(state.error).toBeDefined();
    expect(removeAccountData).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
