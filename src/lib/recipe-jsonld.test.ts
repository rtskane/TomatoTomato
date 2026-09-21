import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatIngredient } from "./recipe-display";
import { normalizeText } from "./recipe-import";
import { extractJsonLdBlocks, parseRecipeFromHtml } from "./recipe-jsonld";

// The fixtures are the real structured data three publishers serve, trimmed to
// the fields we read and wrapped back into a page. Real data rather than
// invented data because the awkward parts of this format — a yield that is an
// array of prose, instructions that are objects rather than strings, a "1 loaf,
// 10 serving(s)" that means two different numbers — are all things a
// hand-written fixture would have quietly omitted.
const fixture = (name: string) =>
  readFileSync(join(__dirname, "__fixtures__", `${name}.html`), "utf8");

/** A page carrying one JSON-LD block, for the cases the fixtures don't cover. */
const page = (...blocks: unknown[]) =>
  blocks
    .map((b) => `<script type="application/ld+json">${JSON.stringify(b)}</script>`)
    .join("");

describe("extractJsonLdBlocks", () => {
  it("finds the block in a page", () => {
    expect(extractJsonLdBlocks(fixture("king-arthur"))).toHaveLength(1);
  });

  it("skips a malformed block instead of throwing", () => {
    const html =
      '<script type="application/ld+json">{ not json </script>' +
      '<script type="application/ld+json">{"@type":"Recipe"}</script>';
    expect(extractJsonLdBlocks(html)).toEqual([{ "@type": "Recipe" }]);
  });

  it("has nothing to say about a page with no structured data", () => {
    expect(extractJsonLdBlocks("<html><body>hello</body></html>")).toEqual([]);
  });
});

describe("parseRecipeFromHtml", () => {
  it("reads a King Arthur recipe whole", () => {
    const recipe = parseRecipeFromHtml(fixture("king-arthur"));

    expect(recipe).not.toBeNull();
    expect(recipe!.title).toBe("Classic Birthday Cake");
    expect(recipe!.ingredients).toHaveLength(16);
    expect(recipe!.steps).toHaveLength(17);
    // "PT1H0M" and "PT42M".
    expect(recipe!.prepTimeMinutes).toBe("60");
    expect(recipe!.cookTimeMinutes).toBe("42");
    // recipeYield is ["16 servings", 'one 8" or 9" two-layer cake'].
    expect(recipe!.servings).toBe("16");
  });

  it("reads a Bon Appétit recipe whole", () => {
    const recipe = parseRecipeFromHtml(fixture("bon-appetit"));
    expect(recipe).not.toBeNull();
    expect(recipe!.ingredients.length).toBeGreaterThan(10);
    expect(recipe!.steps.length).toBeGreaterThan(5);
    expect(recipe!.servings).toBe("4");
  });

  it("reads a Food.com recipe whole", () => {
    const recipe = parseRecipeFromHtml(fixture("food-com"));
    expect(recipe).not.toBeNull();
    expect(recipe!.ingredients).toHaveLength(8);
    expect(recipe!.steps).toHaveLength(10);
  });

  // The same losslessness rule the pasted-text path follows: whatever we split
  // a publisher's line into has to join back into the line they published.
  it("round-trips every real ingredient line back to what was published", () => {
    for (const name of ["king-arthur", "bon-appetit", "food-com"]) {
      const html = fixture(name);
      const [block] = extractJsonLdBlocks(html) as [{ recipeIngredient: string[] }];
      const recipe = parseRecipeFromHtml(html)!;

      const published = block.recipeIngredient.map((line) =>
        normalizeText(line).trim(),
      );
      expect(recipe.ingredients.map(formatIngredient)).toEqual(published);
    }
  });

  it("keeps the gram equivalents King Arthur writes into its quantities", () => {
    const recipe = parseRecipeFromHtml(fixture("king-arthur"))!;
    const flour = recipe.ingredients.find((i) => /flour/i.test(i.name))!;
    expect(formatIngredient(flour)).toContain("240g");
  });

  // A yield naming two different things gets the first number. It is a guess,
  // and the author sees it in the form before anything is saved — documented
  // here so the behaviour is a decision rather than a surprise.
  it("takes the first number from a yield that names two things", () => {
    const recipe = parseRecipeFromHtml(fixture("food-com"))!;
    expect(recipe.servings).toBe("1"); // "1 loaf, 10 serving(s)"
  });

  it("finds a recipe nested inside an @graph", () => {
    const html =
      '<script type="application/ld+json">' +
      JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "WebPage", name: "A page" },
          {
            "@type": ["Recipe", "Thing"],
            name: "Nested",
            recipeIngredient: ["2 eggs"],
            recipeInstructions: [{ "@type": "HowToStep", text: "Scramble." }],
          },
        ],
      }) +
      "</script>";

    const recipe = parseRecipeFromHtml(html)!;
    expect(recipe.title).toBe("Nested");
    expect(recipe.steps).toEqual(["Scramble."]);
  });

  it("flattens HowToSection groups into plain steps", () => {
    const html =
      '<script type="application/ld+json">' +
      JSON.stringify({
        "@type": "Recipe",
        name: "Sectioned",
        recipeIngredient: ["2 eggs"],
        recipeInstructions: [
          {
            "@type": "HowToSection",
            name: "For the sauce",
            itemListElement: [
              { "@type": "HowToStep", text: "Sweat the onions." },
              { "@type": "HowToStep", text: "Add the tomatoes." },
            ],
          },
        ],
      }) +
      "</script>";

    // The section's own name is dropped — the page has nowhere to put a
    // subheading, and printing it as a step would read as an instruction.
    expect(parseRecipeFromHtml(html)!.steps).toEqual([
      "Sweat the onions.",
      "Add the tomatoes.",
    ]);
  });

  it("strips the HTML publishers put in fields documented as text", () => {
    const html =
      '<script type="application/ld+json">' +
      JSON.stringify({
        "@type": "Recipe",
        name: "Tagged",
        recipeIngredient: ["<b>2</b> eggs"],
        recipeInstructions: 'Visit <a href="#">our shop</a> &amp; scramble.',
      }) +
      "</script>";

    const recipe = parseRecipeFromHtml(html)!;
    expect(recipe.ingredients[0].name).toBe("eggs");
    expect(recipe.steps).toEqual(["Visit our shop & scramble."]);
  });

  // Null means "nothing to read here", which the importer turns into "paste it".
  it("returns null for a page with no recipe in it", () => {
    expect(parseRecipeFromHtml("<html><body>Not a recipe</body></html>")).toBeNull();
  });

  it("looks past blocks that aren't recipes to the one that is", () => {
    const html = page(
      [{ "@type": "Organization", name: "A publisher" }],
      { "@type": "Recipe", name: "Second block", recipeIngredient: ["2 eggs"] },
    );
    expect(parseRecipeFromHtml(html)!.title).toBe("Second block");
  });

  // Some publishers list ingredients as objects rather than strings.
  it("reads ingredients given as objects with a name, skipping ones without", () => {
    const html = page({
      "@type": "Recipe",
      name: "Objects",
      recipeIngredient: [{ name: "2 eggs" }, { amount: 3 }, null],
    });
    expect(parseRecipeFromHtml(html)!.ingredients.map((i) => i.name)).toEqual(["eggs"]);
  });

  it("reads ingredients given as one string rather than a list", () => {
    const html = page({ "@type": "Recipe", name: "One line", recipeIngredient: "2 eggs" });
    expect(parseRecipeFromHtml(html)!.ingredients).toEqual([
      { quantity: "2", unit: "", name: "eggs", note: "" },
    ]);
  });

  // HowToStep's `text` is the step; some publishers only fill in `name`.
  it("falls back to a step's name when it has no text, and drops empty steps", () => {
    const html = page({
      "@type": "Recipe",
      name: "Named steps",
      recipeIngredient: ["2 eggs"],
      recipeInstructions: [
        { "@type": "HowToStep", name: "Whisk the eggs." },
        { "@type": "HowToStep", text: "" },
      ],
    });
    expect(parseRecipeFromHtml(html)!.steps).toEqual(["Whisk the eggs."]);
  });

  // A walk over a stranger's JSON has to end. These depths are far past
  // anything a real publisher nests; past them, the parser stops looking.
  it("gives up on absurdly deep nesting rather than walking it", () => {
    let recipe: unknown = { "@type": "Recipe", name: "Buried", recipeIngredient: ["2 eggs"] };
    for (let i = 0; i < 20; i++) recipe = { wrapper: recipe };
    expect(parseRecipeFromHtml(page(recipe))).toBeNull();

    let steps: unknown = "Buried step.";
    for (let i = 0; i < 10; i++) steps = [steps];
    const html = page({
      "@type": "Recipe",
      name: "Deep steps",
      recipeIngredient: ["2 eggs"],
      recipeInstructions: steps,
    });
    expect(parseRecipeFromHtml(html)!.steps).toEqual([]);
  });

  it("splits instructions given as one string into a step per line", () => {
    const html = page({
      "@type": "Recipe",
      name: "One string",
      recipeIngredient: ["2 eggs"],
      recipeInstructions:
        "1. Whisk the eggs.\n2. Heat the pan.<br>3. Scramble.<p>Serve.</p>",
    });
    expect(parseRecipeFromHtml(html)!.steps).toEqual([
      "Whisk the eggs.",
      "Heat the pan.",
      "Scramble.",
      "Serve.",
    ]);
  });

  it("skips a stub Recipe that has no ingredients or steps", () => {
    const html =
      '<script type="application/ld+json">' +
      JSON.stringify({ "@type": "Recipe", name: "Teaser only" }) +
      "</script>";
    expect(parseRecipeFromHtml(html)).toBeNull();
  });
});
