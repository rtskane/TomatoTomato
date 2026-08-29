import type { CreateRecipeValues } from "@/app/cookbooks/[id]/recipes/recipe-form-data";

// Turning written recipes into the shape the form already speaks.
//
// Every way into the app that isn't the form itself — pasted text, a link, a
// photograph — ends up here. They differ only in how they get their hands on
// the words; once there are words, this is the single place that decides what
// is an ingredient and what is a step. That's deliberate: three importers with
// three ideas about what "1 1/4 cups" means would be three sets of bugs.
//
// The output is `CreateRecipeValues`, not a database row. Nothing here writes
// anything — an import produces a filled-in form for the author to look at, and
// the existing create action is still what saves it. So the worst a bad parse
// can do is waste someone's time, never store a mangled recipe.

/** Fraction characters people actually paste, and what they mean. */
const VULGAR_FRACTIONS: Record<string, string> = {
  "½": "1/2",
  "⅓": "1/3",
  "⅔": "2/3",
  "¼": "1/4",
  "¾": "3/4",
  "⅕": "1/5",
  "⅖": "2/5",
  "⅗": "3/5",
  "⅘": "4/5",
  "⅙": "1/6",
  "⅚": "5/6",
  "⅛": "1/8",
  "⅜": "3/8",
  "⅝": "5/8",
  "⅞": "7/8",
};

/**
 * Units we're confident enough about to lift out of a line into their own
 * column. Deliberately conservative — anything not on this list stays part of
 * the ingredient's name, which costs nothing (see `parseIngredientLine`).
 */
const UNITS = [
  "cups", "cup", "c",
  "tablespoons", "tablespoon", "tbsp", "tbs", "tb",
  "teaspoons", "teaspoon", "tsp",
  "grams", "gram", "g",
  "kilograms", "kilogram", "kg",
  "ounces", "ounce", "oz",
  "pounds", "pound", "lbs", "lb",
  "milliliters", "milliliter", "millilitres", "millilitre", "ml",
  "liters", "liter", "litres", "litre", "l",
  "quarts", "quart", "qt",
  "pints", "pint", "pt",
  "gallons", "gallon", "gal",
  "cloves", "clove",
  "sticks", "stick",
  "cans", "can",
  "packages", "package", "pkg",
  "pinches", "pinch",
  "dashes", "dash",
  "handfuls", "handful",
  "slices", "slice",
  "sprigs", "sprig",
  "bunches", "bunch",
];

/** Headings that announce which half of a recipe follows. */
const INGREDIENT_HEADINGS =
  /^\s*(?:ingredients?|you(?:'| wi)?ll need|what you need|shopping list)\s*:?\s*$/i;
const METHOD_HEADINGS =
  /^\s*(?:method|directions?|instructions?|steps?|preparation|to make|how to make it?)\s*:?\s*$/i;

/**
 * Strip the numbering or bullet an author typed at the front of a line.
 *
 * The recipe page draws its own numerals, so a line that arrives as "1. Preheat
 * the oven" would render as "1. 1. Preheat the oven". Removing the author's
 * marker is what lets someone who numbers their steps and someone who doesn't
 * produce the same page — which is the whole reason every recipe in a cookbook
 * looks like it belongs there.
 *
 * A bare "1." is only treated as a marker when something follows it, so an
 * ingredient reading "2 eggs" keeps its 2.
 */
export function stripListMarker(line: string): string {
  return line
    .replace(/^\s*(?:[-*•·–—]|\d{1,2}\s*[.)]|step\s+\d{1,2}\s*[:.)]?)\s+/i, "")
    .trim();
}

/** Replace ½ with 1/2 and friends, and collapse runs of whitespace. */
export function normalizeText(input: string): string {
  let out = input.replace(/\r\n?/g, "\n");
  for (const [glyph, ascii] of Object.entries(VULGAR_FRACTIONS)) {
    // Space around it so "1½" becomes "1 1/2" rather than "11/2".
    out = out.replaceAll(glyph, ` ${ascii} `);
  }
  // Collapse spaces/tabs but keep newlines — they're the record of the
  // author's own line breaks, which is what everything below reads.
  return out.replace(/[^\S\n]+/g, " ");
}

/**
 * A number as written, or null if it isn't one. Handles "2", "0.5", "1/2" and
 * "1 1/4".
 */
function readNumber(token: string): number | null {
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(token);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);

  const fraction = /^(\d+)\/(\d+)$/.exec(token);
  if (fraction) {
    const denominator = Number(fraction[2]);
    return denominator === 0 ? null : Number(fraction[1]) / denominator;
  }

  if (/^\d*\.?\d+$/.test(token)) return Number(token);
  return null;
}

/**
 * Split one written ingredient into the three columns the recipe page renders.
 *
 * ## The rule: only lift out what we can put back
 *
 * `formatIngredient` rebuilds the line by joining quantity, unit and name with
 * spaces. So a quantity is only stored as a number when printing that number
 * gives back exactly the characters the author typed — "2" survives, "0.5"
 * survives, and "1 1/4" does not, because it would come back as "1.25".
 *
 * When it wouldn't survive, the whole line becomes the name and the numeric
 * columns stay empty. `formatIngredient` skips empty parts, so the line renders
 * exactly as written. That makes the round trip — write, import, display, edit,
 * save — provably lossless for every input, at the cost of leaving structure on
 * the table for the fractions.
 *
 * That trade is the right way round while these columns are only ever read back
 * out to be printed. The day something actually needs the number — scaling a
 * recipe, merging a shopping list — is the day this becomes worth a `raw`
 * column, and this comment is the argument for adding one.
 */
export function parseIngredientLine(line: string): {
  name: string;
  quantity: string;
  unit: string;
  note: string;
} {
  const cleaned = stripListMarker(normalizeText(line)).trim();
  const blank = { name: cleaned, quantity: "", unit: "", note: "" };
  if (cleaned === "") return blank;

  // A leading quantity, which may be a mixed fraction ("1 1/4"), then an
  // optional unit, then everything else.
  const match =
    /^(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+)\s*([a-zA-Z]+)?\.?\s+(.*)$/.exec(
      cleaned,
    );
  if (!match) return blank;

  const [, quantityToken, maybeUnit, rest] = match;

  const quantity = readNumber(quantityToken);
  // The losslessness rule. Anything that wouldn't print back identically stays
  // in the name where it can't be damaged.
  if (quantity === null || String(quantity) !== quantityToken) return blank;

  const unit =
    maybeUnit && UNITS.includes(maybeUnit.toLowerCase()) ? maybeUnit : "";

  // A recognised word was a unit; an unrecognised one belongs to the name.
  const name = unit === "" ? [maybeUnit, rest].filter(Boolean).join(" ") : rest;
  if (name.trim() === "") return blank;

  return { name: name.trim(), quantity: quantityToken, unit, note: "" };
}

/**
 * Minutes from an ISO 8601 duration — "PT1H30M" is 90.
 *
 * This is what schema.org recipes state their times in, and it is the one
 * format that arrives already unambiguous, so it is the only one parsed.
 */
export function parseIsoDuration(value: string | null | undefined): string {
  if (!value) return "";
  const match = /^P(?:([\d.]+)D)?(?:T(?:([\d.]+)H)?(?:([\d.]+)M)?)/.exec(
    value.trim().toUpperCase(),
  );
  if (!match) return "";

  const [, days, hours, minutes] = match;
  const total =
    (Number(days ?? 0) || 0) * 1440 +
    (Number(hours ?? 0) || 0) * 60 +
    (Number(minutes ?? 0) || 0);

  return total > 0 ? String(Math.round(total)) : "";
}

/**
 * How many people it feeds, as a whole number.
 *
 * `recipeYield` is routinely an array and routinely prose — King Arthur states
 * `["16 servings", "one 8\" two-layer cake"]`. The servings column is an int, so
 * the first plain number wins and the rest is dropped rather than guessed at.
 */
export function parseYield(value: unknown): string {
  const candidates = Array.isArray(value) ? value : [value];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return String(Math.round(candidate));
    }
    if (typeof candidate === "string") {
      const match = /\d+/.exec(candidate);
      if (match) return match[0];
    }
  }
  return "";
}

/** Does this line read like something you'd buy, rather than something you'd do? */
function looksLikeIngredient(line: string): boolean {
  const trimmed = stripListMarker(line);
  if (trimmed === "") return false;
  // Sentences are instructions; a shopping-list entry is short and rarely ends
  // in a full stop.
  if (trimmed.length > 80) return false;
  if (/[.!?]$/.test(trimmed) && trimmed.length > 40) return false;
  return true;
}

/**
 * Divide a pasted recipe into its ingredients and its method.
 *
 * Headings are believed when they're there, because someone who wrote
 * "Ingredients:" has told us exactly where the line is. Without them the split
 * falls back to shape — a run of short listy lines at the top, then prose — and
 * that guess is allowed to be imperfect precisely because the author lands in
 * the form afterwards and can drag the boundary themselves. An importer that
 * has to be right is a much more expensive thing to build than one that only
 * has to be close.
 */
export function splitSections(text: string): {
  intro: string[];
  ingredients: string[];
  steps: string[];
} {
  const lines = normalizeText(text)
    .split("\n")
    .map((line) => line.trim());

  const intro: string[] = [];
  const ingredients: string[] = [];
  const steps: string[] = [];

  let target: "intro" | "ingredients" | "steps" | null = null;
  let sawHeading = false;

  for (const line of lines) {
    if (line === "") continue;

    if (INGREDIENT_HEADINGS.test(line)) {
      target = "ingredients";
      sawHeading = true;
      continue;
    }
    if (METHOD_HEADINGS.test(line)) {
      target = "steps";
      sawHeading = true;
      continue;
    }

    if (target === "ingredients") ingredients.push(line);
    else if (target === "steps") steps.push(line);
    else intro.push(line);
  }

  if (sawHeading) return { intro, ingredients, steps };

  // No headings: everything landed in `intro`. Take the leading run of listy
  // lines as the ingredients and the remainder as the method.
  const unheaded = intro.slice();
  const guessedIntro: string[] = [];

  // A title is only lifted off the top when the paste has actual prose further
  // down — that is what separates "Toast / Toast the bread." from a terse
  // all-list method like "Boil water / Add pasta / Drain", where the first line
  // is a step and stealing it would lose one.
  const hasProse = unheaded
    .slice(1)
    .some((line) => /[.!?]$/.test(line) || line.length > 80);
  const first = unheaded[0] ?? "";
  const titleish =
    first !== "" &&
    !/^\d/.test(first) &&
    !/[.!?]$/.test(first) &&
    first.split(" ").length <= 8;

  if (hasProse && titleish) guessedIntro.push(unheaded.shift()!);

  const guessedIngredients: string[] = [];
  while (unheaded.length > 0 && looksLikeIngredient(unheaded[0])) {
    guessedIngredients.push(unheaded.shift()!);
  }

  // A recipe that is all list and no prose is far more likely to be a method
  // someone wrote tersely than a shopping list with no cooking in it.
  if (unheaded.length === 0) {
    return { intro: guessedIntro, ingredients: [], steps: guessedIngredients };
  }

  return { intro: guessedIntro, ingredients: guessedIngredients, steps: unheaded };
}

/**
 * A whole pasted recipe, as form values.
 *
 * The title is taken from the first line only when nothing else claims it —
 * pasted text rarely labels its own title, and the first line is what a person
 * would point at if asked which bit was the name.
 */
export function parseRecipeText(text: string): CreateRecipeValues {
  const normalized = normalizeText(text).trim();
  const { intro, ingredients, steps } = splitSections(normalized);

  // When headings did the splitting, the intro is whatever came before them:
  // the first line is the title and any remainder is the description.
  const [titleLine, ...rest] = intro;

  return {
    title: titleLine ? stripListMarker(titleLine) : "",
    description: rest.join(" ").trim(),
    servings: "",
    prepTimeMinutes: "",
    cookTimeMinutes: "",
    ingredients: ingredients
      .map(parseIngredientLine)
      .filter((ingredient) => ingredient.name !== ""),
    steps: steps.map(stripListMarker).filter((step) => step !== ""),
  };
}
