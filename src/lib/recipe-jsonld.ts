import type { CreateRecipeValues } from "@/app/cookbooks/[id]/recipes/recipe-form-data";
import {
  normalizeText,
  parseIngredientLine,
  parseIsoDuration,
  parseYield,
  stripListMarker,
} from "./recipe-import";

// Reading the structured recipe a publisher already put in their page.
//
// Most recipe sites embed a schema.org/Recipe object in a <script
// type="application/ld+json"> block, because that is what search engines read
// to draw a recipe card. It states the ingredients as separate lines and the
// steps as separate steps — the exact shape this app stores — so where it
// exists there is nothing to guess at and no model to ask.
//
// Where it doesn't exist, this returns null and the caller falls back to
// treating the page as text. That split is the whole design: the cheap,
// exact path runs first and the expensive, approximate one only picks up what
// it drops.

/** The handful of fields we read. Everything else in the object is ignored. */
type JsonLdRecipe = {
  name?: unknown;
  description?: unknown;
  recipeYield?: unknown;
  prepTime?: unknown;
  cookTime?: unknown;
  totalTime?: unknown;
  recipeIngredient?: unknown;
  ingredients?: unknown;
  recipeInstructions?: unknown;
};

const asString = (value: unknown): string =>
  typeof value === "string" ? value : "";

/**
 * Publishers put HTML in fields that are documented as text — links inside a
 * step, `<b>` around an ingredient. Rendering that as-is would print the tags,
 * and rendering it as HTML would mean trusting a stranger's markup, so the tags
 * are simply removed.
 */
function stripHtml(value: string): string {
  return normalizeText(
    value
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&quot;/g, '"'),
  )
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Is this object a Recipe? `@type` is sometimes a string, sometimes a list. */
function isRecipe(node: Record<string, unknown>): boolean {
  const type = node["@type"];
  if (typeof type === "string") return type.toLowerCase() === "recipe";
  if (Array.isArray(type)) {
    return type.some((t) => typeof t === "string" && t.toLowerCase() === "recipe");
  }
  return false;
}

/**
 * Find the Recipe anywhere in a parsed JSON-LD document.
 *
 * It is rarely at the top level: publishers wrap everything in an `@graph`, or
 * ship an array of unrelated objects, or nest the recipe inside a WebPage. A
 * walk finds it wherever they put it and costs nothing on the documents where
 * it was at the top all along.
 */
function findRecipe(node: unknown, depth = 0): JsonLdRecipe | null {
  if (depth > 8 || node === null || typeof node !== "object") return null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipe(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const record = node as Record<string, unknown>;
  if (isRecipe(record)) return record as JsonLdRecipe;

  for (const value of Object.values(record)) {
    const found = findRecipe(value, depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * Flatten `recipeInstructions` into plain step text.
 *
 * The field is specified loosely and used loosely: a single string, an array of
 * strings, an array of `HowToStep` objects with a `text`, or `HowToSection`
 * objects whose `itemListElement` holds the real steps. All four appear in the
 * wild; a section's own name is dropped because the recipe page has nowhere to
 * put a subheading, and printing "For the sauce" as though it were an
 * instruction would read as a step you were meant to perform.
 */
function readInstructions(value: unknown, depth = 0): string[] {
  if (depth > 4) return [];

  if (typeof value === "string") {
    // A single blob of prose: split on newlines if it has them, else keep whole.
    return stripHtml(value)
      .split(/\n+/)
      .map((line) => stripListMarker(line))
      .filter((line) => line !== "");
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => readInstructions(item, depth + 1));
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.itemListElement !== undefined) {
      return readInstructions(record.itemListElement, depth + 1);
    }
    const text = stripHtml(asString(record.text) || asString(record.name));
    return text === "" ? [] : [stripListMarker(text)];
  }

  return [];
}

function readIngredients(value: unknown): string[] {
  if (typeof value === "string") return [stripHtml(value)];
  if (!Array.isArray(value)) return [];
  return value
    .map((item) =>
      typeof item === "string"
        ? stripHtml(item)
        : stripHtml(asString((item as Record<string, unknown>)?.name)),
    )
    .filter((line) => line !== "");
}

/**
 * Pull every `application/ld+json` block out of a page.
 *
 * A regex rather than a DOM parse because this runs server-side on a document
 * we never render, and adding a parser to read one script tag would be a
 * dependency earning nothing. Malformed blocks are skipped, not thrown on —
 * one publisher's broken analytics blob shouldn't cost the user their import.
 */
export function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const pattern =
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(pattern)) {
    try {
      blocks.push(JSON.parse(match[1].trim()));
    } catch {
      // Not our problem — try the next block.
    }
  }
  return blocks;
}

/**
 * A page's embedded recipe as form values, or null if it hasn't got one.
 *
 * Null is the signal to fall back to reading the page as text; it is not an
 * error, and a great many perfectly good recipe pages return it.
 */
export function parseRecipeFromHtml(html: string): CreateRecipeValues | null {
  for (const block of extractJsonLdBlocks(html)) {
    const recipe = findRecipe(block);
    if (!recipe) continue;

    const ingredientLines = readIngredients(
      recipe.recipeIngredient ?? recipe.ingredients,
    );
    const steps = readInstructions(recipe.recipeInstructions);

    // A Recipe object with neither is a stub — a category page advertising a
    // recipe rather than containing one. Keep looking.
    if (ingredientLines.length === 0 && steps.length === 0) continue;

    return {
      title: stripHtml(asString(recipe.name)),
      description: stripHtml(asString(recipe.description)),
      servings: parseYield(recipe.recipeYield),
      prepTimeMinutes: parseIsoDuration(asString(recipe.prepTime)),
      cookTimeMinutes: parseIsoDuration(asString(recipe.cookTime)),
      ingredients: ingredientLines
        .map(parseIngredientLine)
        .filter((ingredient) => ingredient.name !== ""),
      steps,
    };
  }

  return null;
}
