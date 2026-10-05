import { describe, it, expect, vi, beforeEach } from "vitest";

const { ensureUser, deleteOwnAccount, getAccountDeletionPreview } = vi.hoisted(
  () => ({
    ensureUser: vi.fn(),
    deleteOwnAccount: vi.fn(),
    getAccountDeletionPreview: vi.fn(),
  }),
);
vi.mock("@/lib/user", () => ({ ensureUser }));
vi.mock("@/lib/account", () => ({ deleteOwnAccount }));
vi.mock("@/server/services/account.service", () => ({
  getAccountDeletionPreview,
}));

import { deleteAccountAction, loadAccountDeletionPreview } from "./actions";

function formOf(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const user = { id: "u1", clerkId: "clerk_1" };

beforeEach(() => {
  vi.clearAllMocks();
  ensureUser.mockResolvedValue(user);
  deleteOwnAccount.mockResolvedValue({ ok: true });
});

describe("loadAccountDeletionPreview", () => {
  it("previews the signed-in user's own account", async () => {
    getAccountDeletionPreview.mockResolvedValue({ recipesElsewhere: 2 });

    expect(await loadAccountDeletionPreview()).toEqual({ recipesElsewhere: 2 });
    expect(getAccountDeletionPreview).toHaveBeenCalledWith("u1");
  });

  it("is null when signed out", async () => {
    ensureUser.mockResolvedValue(null);
    expect(await loadAccountDeletionPreview()).toBeNull();
  });
});

// The order of the two deletes, and a Clerk 404 counting as done, are tested
// on `deleteOwnAccount` in src/lib/account.test.ts.
describe("deleteAccountAction", () => {
  it("deletes the signed-in user's account with their choice", async () => {
    const state = await deleteAccountAction({}, formOf({ recipes: "delete" }));

    expect(deleteOwnAccount).toHaveBeenCalledWith(user, { keepRecipes: false });
    expect(state).toEqual({ deleted: true });
  });

  it("keeps their recipes when they said to", async () => {
    await deleteAccountAction({}, formOf({ recipes: "keep" }));
    expect(deleteOwnAccount).toHaveBeenCalledWith(user, { keepRecipes: true });
  });

  // No question is asked when they have no recipes in shared cookbooks.
  it("keeps recipes when no answer was given", async () => {
    await deleteAccountAction({}, formOf({}));
    expect(deleteOwnAccount).toHaveBeenCalledWith(user, { keepRecipes: true });
  });

  it("says nothing was deleted when our delete fails", async () => {
    deleteOwnAccount.mockResolvedValue({ ok: false, failed: "data" });

    const state = await deleteAccountAction({}, formOf({}));

    expect(state.error).toMatch(/nothing was deleted/);
    expect(state.deleted).toBeUndefined();
  });

  it("says so when the Clerk delete fails, so they can try again", async () => {
    deleteOwnAccount.mockResolvedValue({ ok: false, failed: "sign-in" });

    const state = await deleteAccountAction({}, formOf({ recipes: "keep" }));

    expect(state.error).toMatch(/couldn't close your sign-in/);
    expect(state.deleted).toBeUndefined();
  });

  it("does nothing when signed out", async () => {
    ensureUser.mockResolvedValue(null);

    const state = await deleteAccountAction({}, formOf({}));

    expect(state.error).toBeDefined();
    expect(deleteOwnAccount).not.toHaveBeenCalled();
  });
});
