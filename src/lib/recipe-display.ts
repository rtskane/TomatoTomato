export type IngredientParts = {
  quantity: string;
  unit: string;
  name: string;
};

/**
 * Render an ingredient the way a recipe reads: "200 g spaghetti", "2 eggs",
 * "salt". Every part is optional except the name, so this collapses whatever
 * is missing instead of leaving gaps or stray spaces.
 *
 * The note is deliberately NOT included — the UI shows it in dimmer type
 * beside this, so joining it here would flatten that distinction.
 */
export function formatIngredient({
  quantity,
  unit,
  name,
}: IngredientParts): string {
  return [quantity.trim(), unit.trim(), name.trim()]
    .filter((part) => part !== "")
    .join(" ");
}

/** The fractions a measuring cup or spoon actually marks, as their glyphs. */
const FRACTIONS: readonly [number, string][] = [
  [1 / 8, "⅛"],
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [3 / 8, "⅜"],
  [1 / 2, "½"],
  [5 / 8, "⅝"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
  [7 / 8, "⅞"],
];

/**
 * How close is close enough to call it a fraction. Wide enough to catch the
 * way thirds get stored (0.33, 0.333333) and what scaling leaves behind; narrow
 * enough that 0.3 stays "0.3" rather than being passed off as ⅓.
 */
const FRACTION_TOLERANCE = 0.02;

/** A decimal with no trailing zeros, to two places — or one significant figure below that. */
function tidyDecimal(value: number): string {
  const rounded = Number(value.toFixed(2));
  return String(rounded === 0 ? Number(value.toPrecision(1)) : rounded);
}

/**
 * A stored quantity the way a recipe prints it: `0.5` → "½", `1.333333` →
 * "1⅓", `2` → "2". Quantities are Floats, so without this a third of a cup read
 * "0.333333" — and scaling a recipe makes numbers like that out of tidy ones.
 *
 * - Near a whole number, it's that number.
 * - Otherwise the nearest kitchen fraction, if one is within tolerance.
 * - From 10 up, only halves survive: "187½ g" is still a real instruction, but
 *   "12⅜ g" is false precision, so it rounds to a whole.
 * - Anything else is a short decimal, which at least never lies — unless
 *   `snap` is set; see below.
 *
 * ## Snapping
 *
 * `snap` is for amounts this app computed, not ones an author typed. Scaling ⅓
 * cup from 4 servings to 5 gives 0.4167, and "0.42 cup" isn't something anyone
 * can measure — so a scaled amount goes to the nearest fraction a cup or spoon
 * marks (⅜), the way recipe sites and scaling tools do. An author's own "0.3"
 * is never snapped: that's their number, and changing it would change the
 * recipe. Snapping never rounds a small amount down to nothing — below the
 * smallest mark it stays a decimal.
 */
export function formatQuantity(
  quantity: number | null,
  { snap = false }: { snap?: boolean } = {},
): string {
  if (quantity === null || !Number.isFinite(quantity)) return "";
  if (quantity <= 0) return String(quantity);

  let whole = Math.floor(quantity);
  let fraction = quantity - whole;
  if (fraction > 1 - FRACTION_TOLERANCE) {
    whole += 1;
    fraction = 0;
  }
  if (fraction < FRACTION_TOLERANCE) {
    return whole > 0 ? String(whole) : tidyDecimal(quantity);
  }

  const candidates = whole >= 10 ? FRACTIONS.filter(([v]) => v === 1 / 2) : FRACTIONS;
  const match = candidates.find(
    ([value]) => Math.abs(fraction - value) < FRACTION_TOLERANCE,
  );
  if (match) return `${whole > 0 ? whole : ""}${match[1]}`;

  if (whole >= 10) return String(Math.round(quantity));
  if (!snap) return tidyDecimal(quantity);

  // The nearest mark between this whole number and the next, ends included.
  const marks: [number, string | null][] = [[0, null], ...FRACTIONS, [1, null]];
  const [nearest, glyph] = marks.reduce((best, mark) =>
    Math.abs(fraction - mark[0]) < Math.abs(fraction - best[0]) ? mark : best,
  );
  if (nearest === 1) return String(whole + 1);
  if (glyph) return `${whole > 0 ? whole : ""}${glyph}`;
  return whole > 0 ? String(whole) : tidyDecimal(quantity);
}

/**
 * Units that change with the amount, singular → plural. Abbreviations ("tsp",
 * "g", "oz") don't, so they aren't here — nor is anything not listed, which is
 * left exactly as the author typed it rather than guessed at.
 */
const UNIT_PLURALS: Record<string, string> = {
  cup: "cups",
  tablespoon: "tablespoons",
  teaspoon: "teaspoons",
  pound: "pounds",
  lb: "lbs",
  ounce: "ounces",
  pint: "pints",
  quart: "quarts",
  gallon: "gallons",
  gram: "grams",
  kilogram: "kilograms",
  liter: "liters",
  litre: "litres",
  milliliter: "milliliters",
  millilitre: "millilitres",
  clove: "cloves",
  can: "cans",
  jar: "jars",
  bottle: "bottles",
  box: "boxes",
  bag: "bags",
  package: "packages",
  packet: "packets",
  stick: "sticks",
  slice: "slices",
  piece: "pieces",
  sheet: "sheets",
  sprig: "sprigs",
  stalk: "stalks",
  bunch: "bunches",
  head: "heads",
  handful: "handfuls",
  pinch: "pinches",
  dash: "dashes",
  drop: "drops",
  leaf: "leaves",
  fillet: "fillets",
};

const UNIT_SINGULARS: Record<string, string> = Object.fromEntries(
  Object.entries(UNIT_PLURALS).map(([singular, plural]) => [plural, singular]),
);

/**
 * A unit in the number that goes with `quantity`: "1 cup", "1½ cups", "½
 * cup". Units are stored as typed, so without this halving "2 cups" read
 * "1 cups". Only known units change, and a capital stays a capital.
 */
export function unitFor(
  unit: string,
  quantity: number | null,
  options: { snap?: boolean } = {},
): string {
  const trimmed = unit.trim();
  const lower = trimmed.toLowerCase();
  if (quantity === null) return unit;

  // Decided from what's printed, so an amount that prints as "1" is singular
  // even if scaling left it at 1.004 — which means printing it the same way,
  // snapped or not.
  const plural = quantity > 1 && formatQuantity(quantity, options) !== "1";
  const swapped = plural ? UNIT_PLURALS[lower] : UNIT_SINGULARS[lower];
  if (!swapped) return unit;

  return trimmed[0] === trimmed[0].toUpperCase()
    ? swapped[0].toUpperCase() + swapped.slice(1)
    : swapped;
}

/** What a recipe with no stated servings can be scaled by instead. */
export const SCALE_MULTIPLIERS = [0.5, 1, 2, 3] as const;

/**
 * Minutes as a cook would say them: "45 min", "1 hr", "1 hr 30 min".
 *
 * Recipes routinely run past an hour, and "90 min" reads as arithmetic
 * homework. Returns null for absent or nonsensical values so callers can omit
 * the field rather than print "0 min".
 */
export function formatMinutes(minutes: number | null): string | null {
  if (minutes === null || minutes <= 0) return null;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} hr`;
  return `${hours} hr ${rest} min`;
}

/**
 * Prep + cook, when either is known. Null only when both are missing, so a
 * recipe that states just one of them still shows a total.
 */
export function totalMinutes(
  prep: number | null,
  cook: number | null,
): number | null {
  if (prep === null && cook === null) return null;
  return (prep ?? 0) + (cook ?? 0);
}
