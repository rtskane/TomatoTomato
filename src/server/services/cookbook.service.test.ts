import { describe, it, expect, vi, beforeEach } from "vitest";
import { derivedCoverColor } from "@/lib/book-covers";

// Fully replace the repository module so real Prisma is never imported.
const {
  create,
  listForUser,
  findDetailForUser,
  findMembership,
  update,
  archive,
  restore,
  listArchivedForOwner,
  findWithCounts,
  findCover,
  countByOtherAuthors,
} = vi.hoisted(() => ({
  create: vi.fn(),
  listForUser: vi.fn(),
  findDetailForUser: vi.fn(),
  findMembership: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
  restore: vi.fn(),
  listArchivedForOwner: vi.fn(),
  findWithCounts: vi.fn(),
  findCover: vi.fn(),
  countByOtherAuthors: vi.fn(),
}));
vi.mock("@/server/repositories/cookbook.repository", () => ({
  cookbookRepository: {
    create,
    listForUser,
    findDetailForUser,
    findMembership,
    update,
    archive,
    restore,
    listArchivedForOwner,
    findWithCounts,
    findCover,
  },
}));
vi.mock("@/server/repositories/recipe.repository", () => ({
  recipeRepository: { countByOtherAuthors },
}));

import {
  createCookbook,
  listUserCookbooks,
  getCookbookDetail,
  updateCookbook,
  archiveCookbook,
  restoreCookbook,
  listArchivedCookbooks,
  getArchiveImpact,
} from "./cookbook.service";

beforeEach(() => {
  vi.clearAllMocks();
  // Every update reads the current cover before overwriting it; unless a test
  // says otherwise, there isn't one.
  findCover.mockResolvedValue({ coverImageUrl: null });
});

describe("createCookbook", () => {
  it("returns a validation error and does NOT touch the repository", async () => {
    const result = await createCookbook("u1", { title: "", description: "" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("validation");
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an over-long title without writing", async () => {
    const result = await createCookbook("u1", {
      title: "x".repeat(81),
      description: "",
    });

    expect(result.ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("trims input and persists on the happy path", async () => {
    create.mockResolvedValue({ id: "cb1" });

    const result = await createCookbook("u1", {
      title: "  Weeknight Dinners ",
      description: " Fast meals. ",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.id).toBe("cb1");
    expect(create).toHaveBeenCalledWith({
      ownerId: "u1",
      title: "Weeknight Dinners",
      description: "Fast meals.",
      coverImageUrl: null,
      // Nothing was chosen, so nothing is stored — the colour keeps being
      // derived from the id.
      coverColor: null,
      coverStyle: "TITLED",
    });
  });

  it("stores a blank description as null rather than an empty string", async () => {
    create.mockResolvedValue({ id: "cb1" });

    await createCookbook("u1", { title: "Weeknight Dinners", description: "  " });

    expect(create).toHaveBeenCalledWith({
      ownerId: "u1",
      title: "Weeknight Dinners",
      description: null,
      coverImageUrl: null,
      coverColor: null,
      coverStyle: "TITLED",
    });
  });

  it("passes the internal user id through as ownerId", async () => {
    create.mockResolvedValue({ id: "cb1" });

    await createCookbook("user_internal_42", {
      title: "Weeknight Dinners",
      description: "",
    });

    expect(create.mock.calls[0][0].ownerId).toBe("user_internal_42");
  });

  it("rethrows unexpected repository errors", async () => {
    create.mockRejectedValue(new Error("connection lost"));

    await expect(
      createCookbook("u1", { title: "Weeknight Dinners", description: "" }),
    ).rejects.toThrow("connection lost");
  });
});

describe("listUserCookbooks", () => {
  const membershipRow = {
    role: "OWNER",
    cookbook: {
      id: "cb1",
      title: "Weeknight Dinners",
      description: "Fast meals.",
      // Null: a cookbook nobody has designed, which is what every row looked
      // like before the designer shipped.
      coverColor: null,
      coverStyle: "TITLED",
      updatedAt: new Date("2026-08-01"),
      _count: { recipes: 3, members: 2 },
    },
  };

  it("scopes the query to the given user", async () => {
    listForUser.mockResolvedValue([]);

    await listUserCookbooks("u1");

    expect(listForUser).toHaveBeenCalledWith("u1");
  });

  it("returns an empty array — never null — when there are no cookbooks", async () => {
    listForUser.mockResolvedValue([]);

    await expect(listUserCookbooks("u1")).resolves.toEqual([]);
  });

  // The view must never see membership.cookbook._count nesting.
  it("flattens membership rows into the summary shape", async () => {
    listForUser.mockResolvedValue([membershipRow]);

    await expect(listUserCookbooks("u1")).resolves.toEqual([
      {
        id: "cb1",
        title: "Weeknight Dinners",
        description: "Fast meals.",
        // Resolved here, so the view is handed a colour rather than a null to
        // work out for itself.
        coverColor: derivedCoverColor("cb1"),
        coverStyle: "TITLED",
        role: "OWNER",
        recipeCount: 3,
        memberCount: 2,
      },
    ]);
  });

  it("lifts the viewer's role out of the membership row", async () => {
    listForUser.mockResolvedValue([{ ...membershipRow, role: "VIEWER" }]);

    const [summary] = await listUserCookbooks("u1");
    expect(summary.role).toBe("VIEWER");
  });

  it("preserves a null description", async () => {
    listForUser.mockResolvedValue([
      { ...membershipRow, cookbook: { ...membershipRow.cookbook, description: null } },
    ]);

    const [summary] = await listUserCookbooks("u1");
    expect(summary.description).toBeNull();
  });

  it("preserves the repository's ordering", async () => {
    listForUser.mockResolvedValue([
      membershipRow,
      { ...membershipRow, cookbook: { ...membershipRow.cookbook, id: "cb2" } },
    ]);

    const summaries = await listUserCookbooks("u1");
    expect(summaries.map((c) => c.id)).toEqual(["cb1", "cb2"]);
  });
});

describe("getCookbookDetail", () => {
  const recipeRow = {
    id: "r1",
    title: "Carbonara",
    description: "Rich.",
    servings: 4,
    prepTimeMinutes: 15,
    cookTimeMinutes: 20,
    author: { username: "chef_ryan", firstName: "Ryan", lastName: "K" },
    _count: { ingredients: 5, steps: 3 },
  };
  const detailRow = {
    role: "OWNER",
    cookbook: {
      id: "cb1",
      title: "Weeknight Dinners",
      description: "Fast meals.",
      recipes: [recipeRow],
    },
  };

  it("passes the cookbook and user through to the repository", async () => {
    findDetailForUser.mockResolvedValue(detailRow);

    await getCookbookDetail("u1", "cb1");

    expect(findDetailForUser).toHaveBeenCalledWith("cb1", "u1");
  });

  it("returns null for a non-member", async () => {
    findDetailForUser.mockResolvedValue(null);

    await expect(getCookbookDetail("u1", "cb1")).resolves.toBeNull();
  });

  it("flattens the membership row into the detail shape", async () => {
    findDetailForUser.mockResolvedValue(detailRow);

    const detail = await getCookbookDetail("u1", "cb1");

    expect(detail).toMatchObject({
      id: "cb1",
      title: "Weeknight Dinners",
      role: "OWNER",
      canAddRecipes: true,
    });
    expect(detail?.recipes[0]).toEqual({
      id: "r1",
      title: "Carbonara",
      description: "Rich.",
      servings: 4,
      prepTimeMinutes: 15,
      cookTimeMinutes: 20,
      authorName: "chef_ryan",
      ingredientCount: 5,
      stepCount: 3,
    });
  });

  it("marks a VIEWER as unable to add recipes", async () => {
    findDetailForUser.mockResolvedValue({ ...detailRow, role: "VIEWER" });

    const detail = await getCookbookDetail("u1", "cb1");

    expect(detail?.canAddRecipes).toBe(false);
  });

  it("marks an EDITOR as able to add recipes", async () => {
    findDetailForUser.mockResolvedValue({ ...detailRow, role: "EDITOR" });

    const detail = await getCookbookDetail("u1", "cb1");

    expect(detail?.canAddRecipes).toBe(true);
  });

  // username is nullable until onboarding completes, so the author label has to
  // degrade rather than render "null".
  it("falls back to the author's real name when there's no username", async () => {
    findDetailForUser.mockResolvedValue({
      ...detailRow,
      cookbook: {
        ...detailRow.cookbook,
        recipes: [
          {
            ...recipeRow,
            author: { username: null, firstName: "Ryan", lastName: "K" },
          },
        ],
      },
    });

    const detail = await getCookbookDetail("u1", "cb1");

    expect(detail?.recipes[0].authorName).toBe("Ryan K");
  });

  it("falls back to Unknown when the author has no name at all", async () => {
    findDetailForUser.mockResolvedValue({
      ...detailRow,
      cookbook: {
        ...detailRow.cookbook,
        recipes: [
          {
            ...recipeRow,
            author: { username: null, firstName: null, lastName: null },
          },
        ],
      },
    });

    const detail = await getCookbookDetail("u1", "cb1");

    expect(detail?.recipes[0].authorName).toBe("Unknown");
  });

  it("returns an empty recipe array for a cookbook with none", async () => {
    findDetailForUser.mockResolvedValue({
      ...detailRow,
      cookbook: { ...detailRow.cookbook, recipes: [] },
    });

    const detail = await getCookbookDetail("u1", "cb1");

    expect(detail?.recipes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Editing, archiving, restoring — all owner-only
// ---------------------------------------------------------------------------

describe("updateCookbook", () => {
  beforeEach(() => {
    findMembership.mockResolvedValue({ role: "OWNER" });
    update.mockResolvedValue({ id: "cb1" });
  });

  it("renames a cookbook for its owner", async () => {
    const result = await updateCookbook("owner1", "cb1", {
      title: "  Sunday Roasts ",
      description: " Slow food. ",
    });

    expect(result.ok).toBe(true);
    expect(update).toHaveBeenCalledWith("cb1", {
      title: "Sunday Roasts",
      description: "Slow food.",
      coverImageUrl: null,
      coverColor: null,
      coverStyle: "TITLED",
    });
  });

  it("refuses an EDITOR", async () => {
    findMembership.mockResolvedValue({ role: "EDITOR" });

    const result = await updateCookbook("u1", "cb1", {
      title: "Mine now",
      description: "",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("forbidden");
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses a non-member", async () => {
    findMembership.mockResolvedValue(null);

    const result = await updateCookbook("u1", "cb1", {
      title: "Mine now",
      description: "",
    });

    expect(result.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an empty title without writing", async () => {
    const result = await updateCookbook("owner1", "cb1", {
      title: "",
      description: "",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("validation");
    expect(update).not.toHaveBeenCalled();
  });
});

describe("archiveCookbook", () => {
  beforeEach(() => {
    findMembership.mockResolvedValue({ role: "OWNER" });
    archive.mockResolvedValue({ count: 1 });
  });

  it("archives for the owner", async () => {
    const result = await archiveCookbook("owner1", "cb1");

    expect(result.ok).toBe(true);
    expect(archive).toHaveBeenCalledWith("cb1", "owner1");
  });

  it("refuses an EDITOR", async () => {
    findMembership.mockResolvedValue({ role: "EDITOR" });

    const result = await archiveCookbook("u1", "cb1");

    expect(result.ok).toBe(false);
    expect(archive).not.toHaveBeenCalled();
  });

  // Ownership is in the WHERE clause too, so a write that matches nothing is a
  // failure rather than a silent no-op reported as success.
  it("fails when the write matched no rows", async () => {
    archive.mockResolvedValue({ count: 0 });

    const result = await archiveCookbook("owner1", "cb1");

    expect(result.ok).toBe(false);
  });
});

describe("restoreCookbook", () => {
  // Restore deliberately skips findMembership: that lookup filters archived
  // cookbooks out, so the one operation that must see one can't rely on it.
  it("restores without consulting membership", async () => {
    restore.mockResolvedValue({ count: 1 });

    const result = await restoreCookbook("owner1", "cb1");

    expect(result.ok).toBe(true);
    expect(restore).toHaveBeenCalledWith("cb1", "owner1");
    expect(findMembership).not.toHaveBeenCalled();
  });

  it("fails for someone who doesn't own it", async () => {
    restore.mockResolvedValue({ count: 0 });

    const result = await restoreCookbook("mallory", "cb1");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("forbidden");
  });
});

describe("listArchivedCookbooks", () => {
  it("flattens the rows and keeps the recipe count", async () => {
    listArchivedForOwner.mockResolvedValue([
      {
        id: "cb1",
        title: "Old Favourites",
        description: null,
        archivedAt: new Date(),
        _count: { recipes: 4 },
      },
    ]);

    await expect(listArchivedCookbooks("owner1")).resolves.toEqual([
      {
        id: "cb1",
        title: "Old Favourites",
        description: null,
        recipeCount: 4,
      },
    ]);
  });

  it("returns an empty array when there are none", async () => {
    listArchivedForOwner.mockResolvedValue([]);

    await expect(listArchivedCookbooks("owner1")).resolves.toEqual([]);
  });
});

describe("getArchiveImpact", () => {
  beforeEach(() => {
    findMembership.mockResolvedValue({ role: "OWNER" });
    findWithCounts.mockResolvedValue({
      id: "cb1",
      title: "Weeknight Dinners",
      ownerId: "owner1",
      _count: { recipes: 12, members: 3 },
    });
    countByOtherAuthors.mockResolvedValue(5);
  });

  // The number that makes the warning honest.
  it("reports how many recipes belong to other people", async () => {
    const result = await getArchiveImpact("owner1", "cb1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        title: "Weeknight Dinners",
        recipeCount: 12,
        recipesByOthers: 5,
        memberCount: 3,
      });
    }
  });

  it("refuses anyone who isn't the owner", async () => {
    findMembership.mockResolvedValue({ role: "EDITOR" });

    const result = await getArchiveImpact("u1", "cb1");

    expect(result.ok).toBe(false);
    expect(findWithCounts).not.toHaveBeenCalled();
  });
});

describe("getCookbookDetail — edit permission", () => {
  const detailRow = {
    role: "OWNER",
    cookbook: {
      id: "cb1",
      title: "Weeknight Dinners",
      description: null,
      recipes: [],
    },
  };

  it("marks an OWNER as able to edit the cookbook", async () => {
    findDetailForUser.mockResolvedValue(detailRow);

    const detail = await getCookbookDetail("owner1", "cb1");

    expect(detail?.canEditCookbook).toBe(true);
  });

  it("marks an EDITOR as unable to edit the cookbook itself", async () => {
    findDetailForUser.mockResolvedValue({ ...detailRow, role: "EDITOR" });

    const detail = await getCookbookDetail("u1", "cb1");

    expect(detail?.canEditCookbook).toBe(false);
    expect(detail?.canAddRecipes).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cover images
// ---------------------------------------------------------------------------

const BLOB = "https://abc123.public.blob.vercel-storage.com/cookbook-covers/a.jpg";
const BLOB_2 = "https://abc123.public.blob.vercel-storage.com/cookbook-covers/b.jpg";

describe("createCookbook — cover", () => {
  it("stores the cover it was given", async () => {
    create.mockResolvedValue({ id: "cb1" });

    await createCookbook("u1", {
      title: "Baking",
      description: "",
      coverImageUrl: BLOB,
    });

    expect(create.mock.calls[0][0].coverImageUrl).toBe(BLOB);
  });

  it("stores no cover as null rather than an empty string", async () => {
    create.mockResolvedValue({ id: "cb1" });

    await createCookbook("u1", {
      title: "Baking",
      description: "",
      coverImageUrl: "",
    });

    expect(create.mock.calls[0][0].coverImageUrl).toBeNull();
  });

  // The URL arrives from the browser, so a cookbook must not be creatable with
  // a cover pointing anywhere we don't serve.
  it("refuses a cover hosted somewhere else, and writes nothing", async () => {
    const result = await createCookbook("u1", {
      title: "Baking",
      description: "",
      coverImageUrl: "https://evil.example.com/x.jpg",
    });

    expect(result.ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("updateCookbook — cover", () => {
  beforeEach(() => {
    findMembership.mockResolvedValue({ role: "OWNER" });
    update.mockResolvedValue({ id: "cb1" });
  });

  it("sets a cover on a cookbook that had none", async () => {
    const result = await updateCookbook("owner1", "cb1", {
      title: "Baking",
      description: "",
      coverImageUrl: BLOB,
    });

    expect(update.mock.calls[0][1].coverImageUrl).toBe(BLOB);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.orphanedCover).toBeNull();
  });

  // The old file would otherwise sit in the store forever, paid for and
  // unreachable.
  it("reports the replaced cover so the caller can delete it", async () => {
    findCover.mockResolvedValue({ coverImageUrl: BLOB });

    const result = await updateCookbook("owner1", "cb1", {
      title: "Baking",
      description: "",
      coverImageUrl: BLOB_2,
    });

    expect(update.mock.calls[0][1].coverImageUrl).toBe(BLOB_2);
    if (result.ok) expect(result.value.orphanedCover).toBe(BLOB);
  });

  it("reports the removed cover when the cover is cleared", async () => {
    findCover.mockResolvedValue({ coverImageUrl: BLOB });

    const result = await updateCookbook("owner1", "cb1", {
      title: "Baking",
      description: "",
      coverImageUrl: "",
    });

    expect(update.mock.calls[0][1].coverImageUrl).toBeNull();
    if (result.ok) expect(result.value.orphanedCover).toBe(BLOB);
  });

  // The dangerous case: renaming a cookbook must not delete the picture it
  // still uses.
  it("orphans nothing when the cover is resubmitted unchanged", async () => {
    findCover.mockResolvedValue({ coverImageUrl: BLOB });

    const result = await updateCookbook("owner1", "cb1", {
      title: "A new name",
      description: "",
      coverImageUrl: BLOB,
    });

    expect(update.mock.calls[0][1].coverImageUrl).toBe(BLOB);
    if (result.ok) expect(result.value.orphanedCover).toBeNull();
  });

  it("refuses a cover hosted somewhere else, and writes nothing", async () => {
    const result = await updateCookbook("owner1", "cb1", {
      title: "Baking",
      description: "",
      coverImageUrl: "https://evil.example.com/x.jpg",
    });

    expect(result.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  // Ownership is checked before anything is read or written.
  it("never reads the current cover for someone who can't edit", async () => {
    findMembership.mockResolvedValue({ role: "EDITOR" });

    const result = await updateCookbook("u1", "cb1", {
      title: "Mine now",
      description: "",
      coverImageUrl: BLOB,
    });

    expect(result.ok).toBe(false);
    expect(findCover).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The designed cover — colour and style
// ---------------------------------------------------------------------------

describe("createCookbook — the designed cover", () => {
  it("stores the colour and style the designer posted", async () => {
    create.mockResolvedValue({ id: "cb1" });

    await createCookbook("u1", {
      title: "Baking",
      description: "",
      coverColor: "6",
      coverStyle: "PLAIN",
    });

    expect(create.mock.calls[0][0]).toMatchObject({
      coverColor: 6,
      coverStyle: "PLAIN",
    });
  });

  // Storing the derived colour would freeze a colour nobody picked, and make
  // it indistinguishable from one somebody did.
  it("stores an unchosen colour as null rather than as the derived one", async () => {
    create.mockResolvedValue({ id: "cb1" });

    await createCookbook("u1", { title: "Baking", description: "" });

    expect(create.mock.calls[0][0].coverColor).toBeNull();
  });

  it("refuses a colour the palette doesn't have, and writes nothing", async () => {
    const result = await createCookbook("u1", {
      title: "Baking",
      description: "",
      coverColor: "99",
    });

    expect(result.ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("saves rather than fails when PHOTO arrives with no picture", async () => {
    create.mockResolvedValue({ id: "cb1" });

    const result = await createCookbook("u1", {
      title: "Baking",
      description: "",
      coverStyle: "PHOTO",
      coverImageUrl: "",
    });

    expect(result.ok).toBe(true);
    expect(create.mock.calls[0][0].coverStyle).toBe("TITLED");
  });
});

describe("updateCookbook — the designed cover", () => {
  beforeEach(() => {
    findMembership.mockResolvedValue({ role: "OWNER" });
    update.mockResolvedValue({ id: "cb1" });
  });

  it("writes a redesigned cover", async () => {
    const result = await updateCookbook("owner1", "cb1", {
      title: "Baking",
      description: "",
      coverColor: "8",
      coverStyle: "PLAIN",
    });

    expect(result.ok).toBe(true);
    expect(update.mock.calls[0][1]).toMatchObject({
      coverColor: 8,
      coverStyle: "PLAIN",
    });
  });

  // Switching a photo cover back to a colour keeps the picture, so switching
  // forward again needs no re-upload — and nothing is orphaned.
  it("keeps the picture when the style moves off PHOTO", async () => {
    findCover.mockResolvedValue({ coverImageUrl: BLOB });

    const result = await updateCookbook("owner1", "cb1", {
      title: "Baking",
      description: "",
      coverImageUrl: BLOB,
      coverColor: "2",
      coverStyle: "TITLED",
    });

    expect(update.mock.calls[0][1].coverImageUrl).toBe(BLOB);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.orphanedCover).toBeNull();
  });
});

describe("listUserCookbooks — resolving the colour", () => {
  function rowWith(coverColor: number | null) {
    return {
      role: "OWNER",
      cookbook: {
        id: "cb1",
        title: "Baking",
        description: null,
        coverImageUrl: null,
        coverColor,
        coverStyle: "TITLED",
        updatedAt: new Date("2026-08-01"),
        _count: { recipes: 0, members: 1 },
      },
    };
  }

  it("hands the view the stored choice", async () => {
    listForUser.mockResolvedValue([rowWith(4)]);

    const [summary] = await listUserCookbooks("u1");
    expect(summary.coverColor).toBe(4);
  });

  // The view is handed a colour, never a null it has to work out for itself.
  it("hands the view a derived colour when nobody has chosen", async () => {
    listForUser.mockResolvedValue([rowWith(null)]);

    const [summary] = await listUserCookbooks("u1");
    expect(summary.coverColor).toBe(derivedCoverColor("cb1"));
  });
});
