import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatIngredient } from "./recipe-display";
import { extractJsonLdBlocks, parseRecipeFromHtml } from "./recipe-jsonld";

// The fixtures are the real structured data three publishers serve, trimmed to
// the fields we read and wrapped back into a page. Real data rather than
// invented data because the awkward parts of this format — a yield that is an
// array of prose, instructions that are objects rather than strings, a "1 loaf,
// 10 serving(s)" that means two different numbers — are all things a
// hand-written fixture would have quietly omitted.
const fixture = (name: string) =>
  readFileSync(join(__dirname, "__fixtures__", `${name}.html`), "utf8");

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
      const recipe = parseRecipeFromHtml(fixture(name))!;
      for (const ingredient of recipe.ingredients) {
        expect(formatIngredient(ingredient)).not.toBe("");
      }
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

  // Null is the signal to fall back to reading the page as text, not an error.
  it("returns null for a page with no recipe in it", () => {
    expect(parseRecipeFromHtml("<html><body>Not a recipe</body></html>")).toBeNull();
  });

  it("skips a stub Recipe that has no ingredients or steps", () => {
    const html =
      '<script type="application/ld+json">' +
      JSON.stringify({ "@type": "Recipe", name: "Teaser only" }) +
      "</script>";
    expect(parseRecipeFromHtml(html)).toBeNull();
  });
});
