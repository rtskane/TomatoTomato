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
