import { describe, it, expect, vi, beforeEach } from "vitest";

// Fully replace the repository module so real Prisma is never imported.
const { create, listForUser, findDetailForUser } = vi.hoisted(() => ({
  create: vi.fn(),
  listForUser: vi.fn(),
  findDetailForUser: vi.fn(),
}));
vi.mock("@/server/repositories/cookbook.repository", () => ({
  cookbookRepository: { create, listForUser, findDetailForUser },
}));

import {
  createCookbook,
  listUserCookbooks,
  getCookbookDetail,
} from "./cookbook.service";

beforeEach(() => {
  vi.clearAllMocks();
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
    });
  });

  it("stores a blank description as null rather than an empty string", async () => {
    create.mockResolvedValue({ id: "cb1" });

    await createCookbook("u1", { title: "Weeknight Dinners", description: "  " });

    expect(create).toHaveBeenCalledWith({
      ownerId: "u1",
      title: "Weeknight Dinners",
      description: null,
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
