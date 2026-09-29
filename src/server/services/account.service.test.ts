import { describe, it, expect, vi, beforeEach } from "vitest";

// Fully replace the repository so real Prisma is never imported.
const repo = vi.hoisted(() => ({
  findFootprint: vi.fn(),
  deleteAccount: vi.fn(),
}));
vi.mock("@/server/repositories/account.repository", () => ({
  accountRepository: repo,
}));

import {
  chooseHeir,
  planAccountDeletion,
  getAccountDeletionPreview,
  deleteAccount,
} from "./account.service";

beforeEach(() => {
  vi.clearAllMocks();
});

const member = (userId: string, role: "EDITOR" | "VIEWER") => ({ userId, role });

// Two owned cookbooks — one shared, one only theirs — plus recipes they wrote
// in the shared one, in the solo one, and in somebody else's.
const footprint = () => ({
  id: "me",
  ownedCookbooks: [
    {
      id: "shared",
      coverImageUrl: "https://x.public.blob.vercel-storage.com/shared-cover",
      members: [member("vic", "VIEWER"), member("eddie", "EDITOR")],
      recipes: [{ coverImageUrl: "https://x.public.blob.vercel-storage.com/theirs" }],
    },
    {
      id: "solo",
      coverImageUrl: "https://x.public.blob.vercel-storage.com/solo-cover",
      members: [],
      recipes: [
        { coverImageUrl: "https://x.public.blob.vercel-storage.com/solo-dish" },
        { coverImageUrl: null },
      ],
    },
  ],
  recipes: [
    { id: "r-shared", cookbookId: "shared", coverImageUrl: "https://x.public.blob.vercel-storage.com/mine-1" },
    { id: "r-solo", cookbookId: "solo", coverImageUrl: "https://x.public.blob.vercel-storage.com/solo-dish" },
    { id: "r-elsewhere", cookbookId: "friends", coverImageUrl: null },
  ],
});

describe("chooseHeir", () => {
  it("prefers the longest-standing editor over an earlier viewer", () => {
    expect(chooseHeir([member("vic", "VIEWER"), member("eddie", "EDITOR")])?.userId).toBe(
      "eddie",
    );
  });

  it("falls back to the longest-standing member of any role", () => {
    expect(chooseHeir([member("vic", "VIEWER"), member("val", "VIEWER")])?.userId).toBe(
      "vic",
    );
  });

  it("is null when nobody else is in it", () => {
    expect(chooseHeir([])).toBeNull();
  });
});

describe("planAccountDeletion", () => {
  it("hands a shared cookbook on and deletes a solo one", () => {
    const plan = planAccountDeletion(footprint(), true);

    expect(plan.userId).toBe("me");
    expect(plan.transfers).toEqual([{ cookbookId: "shared", heirId: "eddie" }]);
    expect(plan.deleteCookbookIds).toEqual(["solo"]);
  });

  it("keeps their recipes in surviving cookbooks when asked to", () => {
    const plan = planAccountDeletion(footprint(), true);

    expect(plan.deleteRecipeIds).toEqual([]);
    // Only the solo cookbook's files: its cover and its recipes' photos.
    expect(plan.orphanedImages).toEqual([
      "https://x.public.blob.vercel-storage.com/solo-cover",
      "https://x.public.blob.vercel-storage.com/solo-dish",
    ]);
  });

  it("deletes their recipes in surviving cookbooks, and their photos, when asked to", () => {
    const plan = planAccountDeletion(footprint(), false);

    // Not r-solo: it goes with its cookbook, so it isn't a separate delete.
    expect(plan.deleteRecipeIds).toEqual(["r-shared", "r-elsewhere"]);
    expect(plan.orphanedImages).toContain(
      "https://x.public.blob.vercel-storage.com/mine-1",
    );
  });

  // Other members' work in a handed-on cookbook is never touched.
  it("never deletes a recipe someone else wrote", () => {
    const plan = planAccountDeletion(footprint(), false);

    expect(plan.orphanedImages).not.toContain(
      "https://x.public.blob.vercel-storage.com/theirs",
    );
    expect(plan.orphanedImages).not.toContain(
      "https://x.public.blob.vercel-storage.com/shared-cover",
    );
  });
});

describe("getAccountDeletionPreview", () => {
  // Not the one in their solo cookbook: that goes with it, so there's nothing
  // to choose.
  it("counts the recipes that are theirs to decide about", async () => {
    repo.findFootprint.mockResolvedValue(footprint());

    expect(await getAccountDeletionPreview("me")).toEqual({
      recipesElsewhere: 2,
    });
  });

  it("is null for an account that isn't there", async () => {
    repo.findFootprint.mockResolvedValue(null);
    expect(await getAccountDeletionPreview("me")).toBeNull();
  });
});

describe("deleteAccount", () => {
  it("carries out the plan and hands back the orphaned images", async () => {
    repo.findFootprint.mockResolvedValue(footprint());

    const result = await deleteAccount("me", { keepRecipes: false });

    expect(repo.deleteAccount).toHaveBeenCalledWith({
      userId: "me",
      transfers: [{ cookbookId: "shared", heirId: "eddie" }],
      deleteCookbookIds: ["solo"],
      deleteRecipeIds: ["r-shared", "r-elsewhere"],
    });
    expect(result.orphanedImages).toHaveLength(3);
  });

  // The dialog deletes the Clerk user last, which fires the webhook for an
  // account that's already gone.
  it("does nothing for an account that's already deleted", async () => {
    repo.findFootprint.mockResolvedValue(null);

    expect(await deleteAccount("me", { keepRecipes: true })).toEqual({
      orphanedImages: [],
    });
    expect(repo.deleteAccount).not.toHaveBeenCalled();
  });
});
