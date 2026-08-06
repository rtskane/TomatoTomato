import { describe, it, expect, vi, beforeEach } from "vitest";

const { findMembership, create } = vi.hoisted(() => ({
  findMembership: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@/server/repositories/cookbook.repository", () => ({
  cookbookRepository: { findMembership },
}));
vi.mock("@/server/repositories/recipe.repository", () => ({
  recipeRepository: { create },
}));

import { createRecipe, type CreateRecipeInput } from "./recipe.service";

beforeEach(() => {
  vi.clearAllMocks();
  findMembership.mockResolvedValue({ role: "EDITOR" });
  create.mockResolvedValue({ id: "r1" });
});

function input(overrides: Partial<CreateRecipeInput> = {}): CreateRecipeInput {
  return {
    title: "Carbonara",
    description: "",
    servings: "",
    prepTimeMinutes: "",
    cookTimeMinutes: "",
    ingredients: [{ name: "spaghetti", quantity: "200", unit: "g", note: "" }],
    steps: ["Boil the pasta."],
    ...overrides,
  };
}

describe("createRecipe — authorization", () => {
  it("refuses a non-member", async () => {
    findMembership.mockResolvedValue(null);

    const result = await createRecipe("u1", "cb1", input());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("forbidden");
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses a VIEWER", async () => {
    findMembership.mockResolvedValue({ role: "VIEWER" });

    const result = await createRecipe("u1", "cb1", input());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("forbidden");
    expect(create).not.toHaveBeenCalled();
  });

  it("allows an OWNER", async () => {
    findMembership.mockResolvedValue({ role: "OWNER" });

    await expect(createRecipe("u1", "cb1", input())).resolves.toMatchObject({
      ok: true,
    });
  });

  // Order matters: a non-member shouldn't learn whether their input was valid.
  it("checks permission before validating, so bad input still reads as forbidden", async () => {
    findMembership.mockResolvedValue(null);

    const result = await createRecipe("u1", "cb1", input({ title: "" }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("forbidden");
  });

  it("scopes the membership lookup to the given cookbook and user", async () => {
    await createRecipe("u1", "cb1", input());

    expect(findMembership).toHaveBeenCalledWith("cb1", "u1");
  });
});

describe("createRecipe — validation", () => {
  it("rejects a missing title without writing", async () => {
    const result = await createRecipe("u1", "cb1", input({ title: "" }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("validation");
    expect(create).not.toHaveBeenCalled();
  });

  // Rows the user added but never filled in are noise, not errors.
  it("drops entirely blank ingredient rows", async () => {
    await createRecipe(
      "u1",
      "cb1",
      input({
        ingredients: [
          { name: "spaghetti", quantity: "200", unit: "g", note: "" },
          { name: "", quantity: "", unit: "", note: "" },
        ],
      }),
    );

    expect(create.mock.calls[0][0].ingredients).toHaveLength(1);
  });

  it("drops blank step rows", async () => {
    await createRecipe(
      "u1",
      "cb1",
      input({ steps: ["Boil the pasta.", "   ", ""] }),
    );

    expect(create.mock.calls[0][0].steps).toEqual(["Boil the pasta."]);
  });

  // A half-filled row is a real mistake and must still surface.
  it("still rejects a row with a quantity but no name", async () => {
    const result = await createRecipe(
      "u1",
      "cb1",
      input({
        ingredients: [{ name: "", quantity: "200", unit: "g", note: "" }],
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("validation");
  });

  it("rejects a recipe whose only ingredient row was blank", async () => {
    const result = await createRecipe(
      "u1",
      "cb1",
      input({ ingredients: [{ name: "", quantity: "", unit: "", note: "" }] }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/at least one ingredient/i);
    }
  });

  it("rejects a recipe with no usable steps", async () => {
    const result = await createRecipe("u1", "cb1", input({ steps: ["  "] }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/at least one step/i);
  });
});

describe("createRecipe — persistence", () => {
  it("passes the author, cookbook and parsed fields to the repository", async () => {
    await createRecipe(
      "u1",
      "cb1",
      input({ servings: "4", prepTimeMinutes: "15", cookTimeMinutes: "20" }),
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        cookbookId: "cb1",
        authorId: "u1",
        title: "Carbonara",
        servings: 4,
        prepTimeMinutes: 15,
        cookTimeMinutes: 20,
      }),
    );
  });

  it("converts absent optional fields to null for the database", async () => {
    await createRecipe("u1", "cb1", input());

    expect(create.mock.calls[0][0]).toMatchObject({
      description: null,
      servings: null,
      prepTimeMinutes: null,
      cookTimeMinutes: null,
    });
    expect(create.mock.calls[0][0].ingredients[0]).toMatchObject({
      unit: "g",
      note: null,
    });
  });

  it("preserves the order of ingredients and steps", async () => {
    await createRecipe(
      "u1",
      "cb1",
      input({
        ingredients: [
          { name: "first", quantity: "", unit: "", note: "" },
          { name: "second", quantity: "", unit: "", note: "" },
        ],
        steps: ["one", "two", "three"],
      }),
    );

    expect(create.mock.calls[0][0].ingredients.map((i: { name: string }) => i.name)).toEqual(
      ["first", "second"],
    );
    expect(create.mock.calls[0][0].steps).toEqual(["one", "two", "three"]);
  });

  it("returns the new recipe id", async () => {
    const result = await createRecipe("u1", "cb1", input());

    expect(result).toEqual({ ok: true, value: { id: "r1" } });
  });

  it("rethrows unexpected repository errors", async () => {
    create.mockRejectedValue(new Error("connection lost"));

    await expect(createRecipe("u1", "cb1", input())).rejects.toThrow(
      "connection lost",
    );
  });
});
