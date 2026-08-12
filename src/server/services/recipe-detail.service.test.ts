import { describe, it, expect, vi, beforeEach } from "vitest";

const { findDetailForUser, findMembership } = vi.hoisted(() => ({
  findDetailForUser: vi.fn(),
  findMembership: vi.fn(),
}));
vi.mock("@/server/repositories/recipe.repository", () => ({
  recipeRepository: { findDetailForUser },
}));
vi.mock("@/server/repositories/cookbook.repository", () => ({
  cookbookRepository: { findMembership },
}));

import { getRecipeDetail } from "./recipe-detail.service";

const row = {
  id: "r1",
  title: "Carbonara",
  description: "Rich.",
  servings: 4,
  prepTimeMinutes: 15,
  cookTimeMinutes: 30,
  createdAt: new Date("2026-08-01"),
  authorId: "u_author",
  author: { username: "chef_ryan", firstName: "Ryan", lastName: "K" },
  cookbook: { id: "cb1", title: "Weeknight Dinners" },
  ingredients: [
    { id: "i1", name: "spaghetti", quantity: 200, unit: "g", note: null },
    { id: "i2", name: "egg", quantity: 2, unit: null, note: "yolks only" },
  ],
  steps: [
    { id: "s1", instruction: "Boil the pasta." },
    { id: "s2", instruction: "Mix the eggs." },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  findDetailForUser.mockResolvedValue(row);
  findMembership.mockResolvedValue({ role: "VIEWER" });
});

describe("getRecipeDetail", () => {
  it("passes cookbook, recipe and user through to the repository", async () => {
    await getRecipeDetail("u1", "cb1", "r1");

    expect(findDetailForUser).toHaveBeenCalledWith("cb1", "r1", "u1");
  });

  it("returns null when the repository finds nothing", async () => {
    findDetailForUser.mockResolvedValue(null);

    await expect(getRecipeDetail("u1", "cb1", "r1")).resolves.toBeNull();
  });

  it("flattens the row into the detail shape", async () => {
    const detail = await getRecipeDetail("u1", "cb1", "r1");

    expect(detail).toMatchObject({
      id: "r1",
      title: "Carbonara",
      servings: 4,
      authorName: "chef_ryan",
      cookbook: { id: "cb1", title: "Weeknight Dinners" },
    });
  });

  it("computes the total time from prep plus cook", async () => {
    const detail = await getRecipeDetail("u1", "cb1", "r1");

    expect(detail?.totalTimeMinutes).toBe(45);
  });

  it("leaves total null when neither time is given", async () => {
    findDetailForUser.mockResolvedValue({
      ...row,
      prepTimeMinutes: null,
      cookTimeMinutes: null,
    });

    const detail = await getRecipeDetail("u1", "cb1", "r1");

    expect(detail?.totalTimeMinutes).toBeNull();
  });

  // Quantity is a Float column, so the view would otherwise have to decide how
  // to print 2 vs 0.5. The service hands it over already stringified.
  it("stringifies quantities without trailing zeros", async () => {
    findDetailForUser.mockResolvedValue({
      ...row,
      ingredients: [
        { id: "i1", name: "salt", quantity: 0.5, unit: "tsp", note: null },
        { id: "i2", name: "egg", quantity: 2, unit: null, note: null },
      ],
    });

    const detail = await getRecipeDetail("u1", "cb1", "r1");

    expect(detail?.ingredients[0].quantity).toBe("0.5");
    expect(detail?.ingredients[1].quantity).toBe("2");
  });

  it("turns a null quantity or unit into an empty string for the view", async () => {
    findDetailForUser.mockResolvedValue({
      ...row,
      ingredients: [
        { id: "i1", name: "salt", quantity: null, unit: null, note: null },
      ],
    });

    const detail = await getRecipeDetail("u1", "cb1", "r1");

    expect(detail?.ingredients[0].quantity).toBe("");
    expect(detail?.ingredients[0].unit).toBe("");
    // A missing note stays null — the view renders it differently from "".
    expect(detail?.ingredients[0].note).toBeNull();
  });

  it("preserves the repository's ingredient and step order", async () => {
    const detail = await getRecipeDetail("u1", "cb1", "r1");

    expect(detail?.ingredients.map((i) => i.name)).toEqual([
      "spaghetti",
      "egg",
    ]);
    expect(detail?.steps.map((s) => s.instruction)).toEqual([
      "Boil the pasta.",
      "Mix the eggs.",
    ]);
  });

  it("falls back to a real name when the author has no username", async () => {
    findDetailForUser.mockResolvedValue({
      ...row,
      author: { username: null, firstName: "Ryan", lastName: "K" },
    });

    const detail = await getRecipeDetail("u1", "cb1", "r1");

    expect(detail?.authorName).toBe("Ryan K");
  });

  it("falls back to Unknown when the author has no name at all", async () => {
    findDetailForUser.mockResolvedValue({
      ...row,
      author: { username: null, firstName: null, lastName: null },
    });

    const detail = await getRecipeDetail("u1", "cb1", "r1");

    expect(detail?.authorName).toBe("Unknown");
  });
});

// canModify decides whether the Edit control renders, and it has to agree with
// what the write path enforces — otherwise the page offers something the
// action refuses.
describe("getRecipeDetail — canModify", () => {
  it("lets the author modify their own recipe", async () => {
    findMembership.mockResolvedValue({ role: "EDITOR" });

    const detail = await getRecipeDetail("u_author", "cb1", "r1");

    expect(detail?.canModify).toBe(true);
  });

  it("refuses an EDITOR who didn't write it", async () => {
    findMembership.mockResolvedValue({ role: "EDITOR" });

    const detail = await getRecipeDetail("someone_else", "cb1", "r1");

    expect(detail?.canModify).toBe(false);
  });

  it("lets the cookbook's OWNER modify anyone's recipe", async () => {
    findMembership.mockResolvedValue({ role: "OWNER" });

    const detail = await getRecipeDetail("owner1", "cb1", "r1");

    expect(detail?.canModify).toBe(true);
  });

  it("refuses a VIEWER even for their own recipe", async () => {
    findMembership.mockResolvedValue({ role: "VIEWER" });

    const detail = await getRecipeDetail("u_author", "cb1", "r1");

    expect(detail?.canModify).toBe(false);
  });
});
