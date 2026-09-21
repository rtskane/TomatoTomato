import { describe, it, expect } from "vitest";
import { formatIngredient } from "./recipe-display";
import {
  normalizeText,
  parseIngredientLine,
  parseIsoDuration,
  parseRecipeText,
  parseYield,
  splitSections,
  stripListMarker,
} from "./recipe-import";

// Real ingredient lines, lifted verbatim from the schema.org data three
// publishers actually serve. Fixtures rather than invented examples because
// every awkward case here — the gram equivalents, the mixed fractions, the bare
// "Kosher salt" with no quantity at all — is one a made-up list wouldn't have
// thought to include.
const REAL_LINES = [
  "2 cups (240g) King Arthur Unbleached All-Purpose Flour",
  "1 1/4 teaspoons table salt",
  "2 teaspoons baking powder",
  "4 large eggs, at room temperature",
  "2 cups (397g) granulated sugar",
  "1 tablespoon (14g) King Arthur Pure Vanilla Extract",
  "1/8 teaspoon almond extract, optional, for enhanced flavor",
  "1 cup (227g) milk, (whole milk preferred)",
  "4 tablespoons (57g) butter, cut into pats",
  "1/3 cup (67g) vegetable oil",
  "1 1/4 cups (106g) natural cocoa powder",
  "4 cups (454g) confectioners' sugar, divided",
  "20 tablespoons (284g) butter, softened",
  "Kosher salt",
  "Freshly ground black pepper",
  "0.5 cup dry white wine",
];

describe("parseIngredientLine", () => {
  // The property the whole importer rests on. Whatever we split a line into,
  // the recipe page rebuilds it by joining the pieces back together — so if
  // that join doesn't reproduce the line, the author's words were damaged on
  // the way in, and no amount of structure is worth that.
  it("round-trips every real line back to exactly what was written", () => {
    for (const line of REAL_LINES) {
      const parsed = parseIngredientLine(line);
      expect(formatIngredient(parsed)).toBe(normalizeText(line).trim());
    }
  });

  it("lifts out a quantity and unit it can print back unchanged", () => {
    expect(parseIngredientLine("2 teaspoons baking powder")).toEqual({
      quantity: "2",
      unit: "teaspoons",
      name: "baking powder",
      note: "",
    });
  });

  // "1 1/4" would come back from the database as "1.25". Rather than change
  // what the author wrote, the line is kept whole and the columns left empty.
  it("keeps a mixed fraction whole rather than turning it into a decimal", () => {
    expect(parseIngredientLine("1 1/4 teaspoons table salt")).toEqual({
      quantity: "",
      unit: "",
      name: "1 1/4 teaspoons table salt",
      note: "",
    });
  });

  it("does the same for a plain fraction", () => {
    expect(parseIngredientLine("1/3 cup (67g) vegetable oil").name).toBe(
      "1/3 cup (67g) vegetable oil",
    );
  });

  it("keeps a decimal that survives the trip", () => {
    const parsed = parseIngredientLine("0.5 cup dry white wine");
    expect(parsed.quantity).toBe("0.5");
    expect(parsed.unit).toBe("cup");
  });

  // A gram equivalent has nowhere of its own to live, so it stays in the name
  // where it still reads correctly, instead of being discarded.
  it("keeps a gram equivalent in the name rather than dropping it", () => {
    const parsed = parseIngredientLine("2 cups (240g) flour");
    expect(parsed.quantity).toBe("2");
    expect(parsed.unit).toBe("cups");
    expect(parsed.name).toBe("(240g) flour");
  });

  it("leaves an ingredient with no quantity alone", () => {
    expect(parseIngredientLine("Kosher salt")).toEqual({
      quantity: "",
      unit: "",
      name: "Kosher salt",
      note: "",
    });
  });

  // "large" is not a unit we lift out — but it is part of the ingredient, and
  // losing it would change the recipe.
  it("leaves a word it doesn't recognise as a unit in the name", () => {
    const parsed = parseIngredientLine("4 large eggs, at room temperature");
    expect(parsed.quantity).toBe("4");
    expect(parsed.unit).toBe("");
    expect(parsed.name).toBe("large eggs, at room temperature");
  });

  // Lines as people type them rather than as publishers serve them.
  it("round-trips the abbreviations people type, full stops and all", () => {
    for (const line of [
      "1 tbsp. sugar",
      "2 lg. eggs",
      "3 c. milk",
      "1 oz. dark chocolate",
      ".5 cup cream",
      "1.0 lb beef",
    ]) {
      expect(formatIngredient(parseIngredientLine(line))).toBe(line);
    }
  });

  it("keeps the full stop with the unit it belongs to", () => {
    expect(parseIngredientLine("1 tbsp. sugar")).toEqual({
      quantity: "1",
      unit: "tbsp.",
      name: "sugar",
      note: "",
    });
    // Not a unit we know, so it stays in the name — full stop included.
    expect(parseIngredientLine("2 lg. eggs").name).toBe("lg. eggs");
  });

  // Only the quantity is ever lifted, so the digits after it must not be
  // mistaken for the start of the name.
  it("never reads the whole number of a mixed fraction as the quantity", () => {
    expect(parseIngredientLine("1 1/4 cups flour").quantity).toBe("");
  });

  it("understands the fraction glyphs people paste", () => {
    expect(parseIngredientLine("½ cup butter").name).toBe("1/2 cup butter");
    expect(parseIngredientLine("1½ cups flour").name).toBe("1 1/2 cups flour");
  });
});

describe("stripListMarker", () => {
  // The page draws its own numerals. Without this, a step someone numbered
  // themselves renders as "1. 1. Preheat the oven".
  it("removes the numbering an author typed", () => {
    expect(stripListMarker("1. Preheat the oven")).toBe("Preheat the oven");
    expect(stripListMarker("2) Cream the butter")).toBe("Cream the butter");
    expect(stripListMarker("Step 3: Fold in the flour")).toBe(
      "Fold in the flour",
    );
  });

  it("removes bullets too, so both ways of writing a list agree", () => {
    expect(stripListMarker("- Preheat the oven")).toBe("Preheat the oven");
    expect(stripListMarker("• Preheat the oven")).toBe("Preheat the oven");
  });

  // The 2 here is the amount, not a list marker.
  it("leaves a quantity at the front of an ingredient alone", () => {
    expect(stripListMarker("2 eggs")).toBe("2 eggs");
    expect(stripListMarker("350 g flour")).toBe("350 g flour");
  });
});

describe("parseIsoDuration", () => {
  it("reads the format schema.org recipes state their times in", () => {
    expect(parseIsoDuration("PT1H30M")).toBe("90");
    expect(parseIsoDuration("PT42M")).toBe("42");
    expect(parseIsoDuration("PT1H0M")).toBe("60");
  });

  it("has nothing to say about a missing or unparseable time", () => {
    expect(parseIsoDuration(null)).toBe("");
    expect(parseIsoDuration("")).toBe("");
    expect(parseIsoDuration("about an hour")).toBe("");
    // Zero is "not stated" as far as the form is concerned, not "no time".
    expect(parseIsoDuration("PT0M")).toBe("");
  });
});

describe("parseYield", () => {
  // Exactly what King Arthur serves for this field.
  it("takes the first real number out of an array of prose", () => {
    expect(parseYield(["16 servings", 'one 8" two-layer cake'])).toBe("16");
  });

  it("handles a plain number and a plain string", () => {
    expect(parseYield(4)).toBe("4");
    expect(parseYield("Serves 6")).toBe("6");
  });

  it("gives up rather than guessing", () => {
    expect(parseYield("a crowd")).toBe("");
    expect(parseYield(undefined)).toBe("");
  });
});

describe("splitSections", () => {
  it("believes a heading when the author wrote one", () => {
    const { intro, ingredients, steps } = splitSections(
      [
        "Weeknight Carbonara",
        "Ingredients",
        "200g spaghetti",
        "2 eggs",
        "Method",
        "Boil the pasta.",
        "Stir through the eggs off the heat.",
      ].join("\n"),
    );

    expect(intro).toEqual(["Weeknight Carbonara"]);
    expect(ingredients).toEqual(["200g spaghetti", "2 eggs"]);
    expect(steps).toEqual([
      "Boil the pasta.",
      "Stir through the eggs off the heat.",
    ]);
  });

  it("recognises the other words people use for the same two headings", () => {
    const { ingredients, steps } = splitSections(
      ["You'll need", "2 eggs", "Directions", "Scramble them."].join("\n"),
    );
    expect(ingredients).toEqual(["2 eggs"]);
    expect(steps).toEqual(["Scramble them."]);
  });

  // Without headings the split is a guess from shape: short listy lines at the
  // top, prose after. It only has to be close — the author reviews it in the
  // form before anything is saved.
  it("guesses from shape when there are no headings", () => {
    const { ingredients, steps } = splitSections(
      [
        "200g spaghetti",
        "2 eggs",
        "Bring a large pot of salted water to the boil and cook the pasta.",
        "Beat the eggs, then stir them through off the heat.",
      ].join("\n"),
    );

    expect(ingredients).toEqual(["200g spaghetti", "2 eggs"]);
    expect(steps).toHaveLength(2);
  });

  // A terse method with no shopping list reads as all-list to the heuristic.
  // Treating that as a recipe with no cooking in it would be the worse mistake.
  it("treats an all-list paste with no prose as the method", () => {
    const { ingredients, steps } = splitSections(
      ["Boil water", "Add pasta", "Drain"].join("\n"),
    );
    expect(ingredients).toEqual([]);
    expect(steps).toEqual(["Boil water", "Add pasta", "Drain"]);
  });
});

describe("splitSections — only one heading", () => {
  // The heading says where the ingredients start, but nothing says where they
  // stop — so the prose that follows is the method, not more ingredients.
  it("finds the method after an Ingredients heading with no Method heading", () => {
    const { intro, ingredients, steps } = splitSections(
      [
        "Pancakes",
        "Ingredients",
        "2 eggs",
        "1 cup milk",
        "Whisk everything together and fry in butter until golden.",
      ].join("\n"),
    );

    expect(intro).toEqual(["Pancakes"]);
    expect(ingredients).toEqual(["2 eggs", "1 cup milk"]);
    expect(steps).toEqual([
      "Whisk everything together and fry in butter until golden.",
    ]);
  });

  // The heading says where the method starts; the ingredients are what sits
  // between the title and it.
  it("finds the ingredients above a Method heading with no Ingredients heading", () => {
    const { intro, ingredients, steps } = splitSections(
      ["Pancakes", "2 eggs", "1 cup milk", "Method", "Whisk it all."].join("\n"),
    );

    expect(intro).toEqual(["Pancakes"]);
    expect(ingredients).toEqual(["2 eggs", "1 cup milk"]);
    expect(steps).toEqual(["Whisk it all."]);
  });

  it("keeps a description between the title and the ingredients", () => {
    const { intro, ingredients } = splitSections(
      [
        "Pancakes",
        "Fluffy, quick, and the only thing my kids will eat on a Saturday morning.",
        "2 eggs",
        "Method",
        "Whisk it all.",
      ].join("\n"),
    );

    expect(intro).toEqual([
      "Pancakes",
      "Fluffy, quick, and the only thing my kids will eat on a Saturday morning.",
    ]);
    expect(ingredients).toEqual(["2 eggs"]);
  });

  it("doesn't take an ingredient for the title", () => {
    const { intro, ingredients } = splitSections(
      ["2 eggs", "1 cup milk", "Method", "Whisk it all."].join("\n"),
    );
    expect(intro).toEqual([]);
    expect(ingredients).toEqual(["2 eggs", "1 cup milk"]);
  });
});

describe("parseRecipeText", () => {
  it("fills in the form from a recipe someone pasted", () => {
    const values = parseRecipeText(
      [
        "Weeknight Carbonara",
        "The one we make when nobody wants to cook.",
        "",
        "Ingredients",
        "- 200 g spaghetti",
        "- 2 eggs",
        "- Black pepper",
        "",
        "Method",
        "1. Boil the pasta.",
        "2. Stir the eggs through off the heat.",
      ].join("\n"),
    );

    expect(values.title).toBe("Weeknight Carbonara");
    expect(values.description).toBe("The one we make when nobody wants to cook.");
    expect(values.ingredients.map((i) => i.name)).toEqual([
      "spaghetti",
      "eggs",
      "Black pepper",
    ]);
    // The author's own "1." and "2." are gone — the page supplies those.
    expect(values.steps).toEqual([
      "Boil the pasta.",
      "Stir the eggs through off the heat.",
    ]);
  });

  // Long lines are method even without a full stop — nobody's shopping list
  // entry runs to a paragraph.
  it("reads a long unpunctuated line as a step, not an ingredient", () => {
    const long =
      "Bring a large pot of generously salted water to a rolling boil and cook the pasta until al dente";
    const values = parseRecipeText(["200g spaghetti", long, "Serve at once."].join("\n"));
    expect(values.ingredients.map((i) => i.name)).toEqual(["spaghetti"]);
    expect(values.steps).toEqual([long, "Serve at once."]);
  });

  it("leaves the title empty when nothing reads like one", () => {
    const values = parseRecipeText("2 eggs\nScramble them slowly in butter until only just set.");
    expect(values.title).toBe("");
    expect(values.ingredients.map((i) => i.name)).toEqual(["eggs"]);
  });

  it("produces something the form can render from almost nothing", () => {
    const values = parseRecipeText("Toast\nToast the bread.");
    expect(values.title).toBe("Toast");
    expect(values.steps.length + values.ingredients.length).toBeGreaterThan(0);
  });
});
