import { describe, it, expect } from "vitest";
import {
  FRESH_PROGRESS,
  PROGRESS_TTL_MS,
  clearTicks,
  parseProgress,
  progressKey,
  setFactor,
  toggleTick,
  type CookingProgress,
} from "./cooking-progress";

const NOW = 1_800_000_000_000;

const saved = (overrides: Partial<CookingProgress> = {}): CookingProgress => ({
  savedAt: NOW,
  factor: 1.5,
  ingredients: ["i1"],
  steps: ["s2"],
  ...overrides,
});

describe("parseProgress", () => {
  it("reads back what was saved", () => {
    expect(parseProgress(JSON.stringify(saved()), NOW + 1000)).toEqual(saved());
  });

  it("starts fresh when nothing is stored", () => {
    expect(parseProgress(null, NOW)).toBe(FRESH_PROGRESS);
  });

  // Tomorrow's dinner starts clean.
  it("lapses once it's older than the TTL", () => {
    const raw = JSON.stringify(saved());
    expect(parseProgress(raw, NOW + PROGRESS_TTL_MS)).toEqual(saved());
    expect(parseProgress(raw, NOW + PROGRESS_TTL_MS + 1)).toBe(FRESH_PROGRESS);
  });

  // It's a convenience: a bad value is dropped, never an error.
  it.each([
    ["not JSON", "{oops"],
    ["the wrong shape", JSON.stringify({ ticked: true })],
    ["a zero factor", JSON.stringify(saved({ factor: 0 }))],
    ["a huge factor", JSON.stringify(saved({ factor: 1e6 }))],
    ["non-string ids", JSON.stringify({ ...saved(), steps: [1, 2] })],
  ])("treats %s as fresh", (_label, raw) => {
    expect(parseProgress(raw, NOW)).toBe(FRESH_PROGRESS);
  });
});

describe("changing progress", () => {
  it("ticks, then unticks, and restarts the clock each time", () => {
    const ticked = toggleTick(FRESH_PROGRESS, "ingredients", "i1", NOW);
    expect(ticked).toMatchObject({ ingredients: ["i1"], savedAt: NOW });

    const unticked = toggleTick(ticked, "ingredients", "i1", NOW + 5);
    expect(unticked).toMatchObject({ ingredients: [], savedAt: NOW + 5 });
  });

  it("keeps ingredients and steps apart", () => {
    const next = toggleTick(saved(), "steps", "i1", NOW);
    expect(next.ingredients).toEqual(["i1"]);
    expect(next.steps).toEqual(["s2", "i1"]);
  });

  it("scales without touching the ticks", () => {
    expect(setFactor(saved(), 2, NOW)).toMatchObject({
      factor: 2,
      ingredients: ["i1"],
      steps: ["s2"],
    });
  });

  // The batch size hasn't changed just because you're starting over.
  it("clears the ticks but keeps the scale", () => {
    expect(clearTicks(saved(), NOW)).toMatchObject({
      factor: 1.5,
      ingredients: [],
      steps: [],
    });
  });

  it("never changes the fresh value in place", () => {
    toggleTick(FRESH_PROGRESS, "steps", "s1", NOW);
    expect(FRESH_PROGRESS.steps).toEqual([]);
  });
});

it("keys progress by recipe", () => {
  expect(progressKey("r1")).not.toBe(progressKey("r2"));
});
