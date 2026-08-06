import { describe, it, expect } from "vitest";
import { createRecipeSchema, ingredientSchema, stepSchema } from "./recipe";

const validBody = {
  title: "Carbonara",
  description: "",
  servings: "",
  prepTimeMinutes: "",
  cookTimeMinutes: "",
  ingredients: [{ name: "spaghetti", quantity: "", unit: "", note: "" }],
  steps: [{ instruction: "Boil the pasta." }],
};

describe("ingredientSchema", () => {
  it("requires a name", () => {
    expect(
      ingredientSchema.safeParse({
        name: "  ",
        quantity: "",
        unit: "",
        note: "",
      }).success,
    ).toBe(false);
  });

  it("parses a decimal quantity", () => {
    const parsed = ingredientSchema.parse({
      name: "salt",
      quantity: "0.5",
      unit: "tsp",
      note: "",
    });
    expect(parsed.quantity).toBe(0.5);
    expect(parsed.unit).toBe("tsp");
  });

  it("leaves quantity undefined when blank — not 0", () => {
    const parsed = ingredientSchema.parse({
      name: "salt",
      quantity: "",
      unit: "",
      note: "",
    });
    expect(parsed.quantity).toBeUndefined();
  });

  it("rejects a non-numeric quantity", () => {
    expect(
      ingredientSchema.safeParse({
        name: "salt",
        quantity: "a pinch",
        unit: "",
        note: "",
      }).success,
    ).toBe(false);
  });

  it("rejects a zero or negative quantity", () => {
    for (const quantity of ["0", "-1"]) {
      expect(
        ingredientSchema.safeParse({ name: "salt", quantity, unit: "", note: "" })
          .success,
      ).toBe(false);
    }
  });
});

describe("stepSchema", () => {
  it("requires an instruction", () => {
    expect(stepSchema.safeParse({ instruction: "   " }).success).toBe(false);
  });

  it("trims the instruction", () => {
    expect(stepSchema.parse({ instruction: "  Boil.  " }).instruction).toBe(
      "Boil.",
    );
  });
});

describe("createRecipeSchema", () => {
  it("accepts a minimal recipe", () => {
    const parsed = createRecipeSchema.parse(validBody);
    expect(parsed.title).toBe("Carbonara");
    expect(parsed.ingredients).toHaveLength(1);
    expect(parsed.steps).toHaveLength(1);
  });

  it("requires a title", () => {
    expect(
      createRecipeSchema.safeParse({ ...validBody, title: "" }).success,
    ).toBe(false);
  });

  it("requires at least one ingredient", () => {
    const result = createRecipeSchema.safeParse({
      ...validBody,
      ingredients: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/at least one ingredient/i);
    }
  });

  it("requires at least one step", () => {
    const result = createRecipeSchema.safeParse({ ...validBody, steps: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/at least one step/i);
    }
  });

  it("treats blank numeric fields as absent rather than zero", () => {
    const parsed = createRecipeSchema.parse(validBody);
    expect(parsed.servings).toBeUndefined();
    expect(parsed.prepTimeMinutes).toBeUndefined();
    expect(parsed.cookTimeMinutes).toBeUndefined();
  });

  it("parses whole-number servings and times", () => {
    const parsed = createRecipeSchema.parse({
      ...validBody,
      servings: "4",
      prepTimeMinutes: "15",
      cookTimeMinutes: "30",
    });
    expect(parsed.servings).toBe(4);
    expect(parsed.prepTimeMinutes).toBe(15);
    expect(parsed.cookTimeMinutes).toBe(30);
  });

  it("rejects a fractional or non-numeric serving count", () => {
    for (const servings of ["2.5", "four", "-3"]) {
      expect(
        createRecipeSchema.safeParse({ ...validBody, servings }).success,
      ).toBe(false);
    }
  });

  it("preserves ingredient and step order", () => {
    const parsed = createRecipeSchema.parse({
      ...validBody,
      ingredients: [
        { name: "first", quantity: "", unit: "", note: "" },
        { name: "second", quantity: "", unit: "", note: "" },
      ],
      steps: [{ instruction: "one" }, { instruction: "two" }],
    });
    expect(parsed.ingredients.map((i) => i.name)).toEqual(["first", "second"]);
    expect(parsed.steps.map((s) => s.instruction)).toEqual(["one", "two"]);
  });
});
