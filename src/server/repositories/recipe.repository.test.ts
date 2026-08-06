import { describe, it, expect, vi, beforeEach } from "vitest";

const { recipe } = vi.hoisted(() => ({
  recipe: { create: vi.fn(), findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: { recipe } }));

import { recipeRepository } from "./recipe.repository";

beforeEach(() => {
  vi.clearAllMocks();
  recipe.create.mockResolvedValue({ id: "r1" });
});

const input = {
  cookbookId: "cb1",
  authorId: "u1",
  title: "Carbonara",
  description: "Fast.",
  servings: 4,
  prepTimeMinutes: 15,
  cookTimeMinutes: 20,
  ingredients: [
    { name: "spaghetti", quantity: 200, unit: "g", note: null },
    { name: "egg", quantity: 2, unit: null, note: "yolks only" },
  ],
  steps: ["Boil the pasta.", "Mix the eggs."],
};

describe("recipeRepository.create", () => {
  it("writes the recipe's own fields", async () => {
    await recipeRepository.create(input);

    expect(recipe.create.mock.calls[0][0].data).toMatchObject({
      cookbookId: "cb1",
      authorId: "u1",
      title: "Carbonara",
      servings: 4,
      prepTimeMinutes: 15,
      cookTimeMinutes: 20,
    });
  });

  it("assigns ingredient positions from array order", async () => {
    await recipeRepository.create(input);

    expect(recipe.create.mock.calls[0][0].data.ingredients.create).toEqual([
      { position: 0, name: "spaghetti", quantity: 200, unit: "g", note: null },
      { position: 1, name: "egg", quantity: 2, unit: null, note: "yolks only" },
    ]);
  });

  it("assigns step positions from array order", async () => {
    await recipeRepository.create(input);

    expect(recipe.create.mock.calls[0][0].data.steps.create).toEqual([
      { position: 0, instruction: "Boil the pasta." },
      { position: 1, instruction: "Mix the eggs." },
    ]);
  });

  // Atomicity is the point: a nested create means there's no window where a
  // recipe exists with only some of its steps.
  it("writes the recipe and all children in a single nested call", async () => {
    await recipeRepository.create(input);

    expect(recipe.create).toHaveBeenCalledOnce();
  });

  it("returns the created recipe", async () => {
    await expect(recipeRepository.create(input)).resolves.toEqual({ id: "r1" });
  });

  it("rethrows unexpected errors unchanged", async () => {
    const boom = new Error("connection lost");
    recipe.create.mockRejectedValue(boom);

    await expect(recipeRepository.create(input)).rejects.toBe(boom);
  });
});

describe("recipeRepository.findDetailForUser", () => {
  beforeEach(() => {
    recipe.findFirst.mockResolvedValue(null);
  });

  // Both ids come from the URL, so all three conditions have to be in the
  // where clause — a miss must return nothing rather than partial data.
  it("requires the recipe id, the cookbook, and a membership", async () => {
    await recipeRepository.findDetailForUser("cb1", "r1", "u1");

    expect(recipe.findFirst.mock.calls[0][0].where).toEqual({
      id: "r1",
      cookbookId: "cb1",
      cookbook: { members: { some: { userId: "u1" } } },
    });
  });

  // Otherwise a real recipe could be rendered under a cookbook it doesn't
  // belong to, with a breadcrumb claiming otherwise.
  it("scopes by cookbook so a recipe can't be shown under the wrong one", async () => {
    await recipeRepository.findDetailForUser("cb_other", "r1", "u1");

    expect(recipe.findFirst.mock.calls[0][0].where.cookbookId).toBe("cb_other");
  });

  it("returns null for a non-member", async () => {
    await expect(
      recipeRepository.findDetailForUser("cb1", "r1", "stranger"),
    ).resolves.toBeNull();
  });

  it("orders ingredients and steps by stored position", async () => {
    await recipeRepository.findDetailForUser("cb1", "r1", "u1");

    const select = recipe.findFirst.mock.calls[0][0].select;
    expect(select.ingredients.orderBy).toEqual({ position: "asc" });
    expect(select.steps.orderBy).toEqual({ position: "asc" });
  });

  it("selects the author and parent cookbook for the byline and breadcrumb", async () => {
    await recipeRepository.findDetailForUser("cb1", "r1", "u1");

    const select = recipe.findFirst.mock.calls[0][0].select;
    expect(select.author.select).toMatchObject({ username: true });
    expect(select.cookbook.select).toEqual({ id: true, title: true });
  });
});
