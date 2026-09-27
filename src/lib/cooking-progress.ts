import { z } from "zod";

// Where someone is in cooking a recipe: which ingredients and steps they've
// ticked, and how far they've scaled it. Kept on their device only — it's
// nobody else's business, and a phone that reloads a background tab mid-cook
// mustn't lose their place.
//
// It lapses after a while so tomorrow's dinner starts clean, not with
// yesterday's ticks. The clock restarts on every change, so a long braise
// doesn't expire halfway through.
//
// Pure: the reading and writing of storage live in the component.

/** How long progress survives without being touched. */
export const PROGRESS_TTL_MS = 12 * 60 * 60 * 1000;

/** Scale factors outside this are a hand-edited value, not a tap on a button. */
const MAX_FACTOR = 100;

const progressSchema = z.object({
  savedAt: z.number(),
  factor: z.number().positive().max(MAX_FACTOR),
  ingredients: z.array(z.string()),
  steps: z.array(z.string()),
});

export type CookingProgress = z.infer<typeof progressSchema>;

export type TickKind = "ingredients" | "steps";

/** Nothing ticked, not scaled. */
export const FRESH_PROGRESS: CookingProgress = Object.freeze({
  savedAt: 0,
  factor: 1,
  ingredients: [],
  steps: [],
}) as CookingProgress;

/** The storage key for one recipe's progress. */
export function progressKey(recipeId: string): string {
  return `cooking-progress:${recipeId}`;
}

/**
 * Read stored progress back. Anything missing, malformed or stale reads as
 * fresh — it's a convenience, so a bad value is dropped, never an error.
 */
export function parseProgress(raw: string | null, now: number): CookingProgress {
  if (!raw) return FRESH_PROGRESS;

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return FRESH_PROGRESS;
  }

  const parsed = progressSchema.safeParse(json);
  if (!parsed.success) return FRESH_PROGRESS;
  if (now - parsed.data.savedAt > PROGRESS_TTL_MS) return FRESH_PROGRESS;
  return parsed.data;
}

/** Tick or untick one ingredient or step. */
export function toggleTick(
  progress: CookingProgress,
  kind: TickKind,
  id: string,
  now: number,
): CookingProgress {
  const ticked = progress[kind];
  return {
    ...progress,
    savedAt: now,
    [kind]: ticked.includes(id)
      ? ticked.filter((other) => other !== id)
      : [...ticked, id],
  };
}

export function setFactor(
  progress: CookingProgress,
  factor: number,
  now: number,
): CookingProgress {
  return { ...progress, savedAt: now, factor };
}

/** Untick everything, keeping the scale — the batch size hasn't changed. */
export function clearTicks(progress: CookingProgress, now: number): CookingProgress {
  return { ...progress, savedAt: now, ingredients: [], steps: [] };
}
