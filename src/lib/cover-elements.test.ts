import { describe, it, expect } from "vitest";
import {
  LIMITS,
  foldAngle,
  isTitle,
  limitSentence,
  titleElement,
  titleScale,
  type CoverElement,
  type TextElement,
} from "./cover-elements";

const text = (overrides: Partial<TextElement> = {}): TextElement => ({
  id: "t",
  type: "text",
  x: 0.5,
  y: 0.5,
  w: 0.6,
  rotation: 0,
  text: "Hello",
  font: "SERIF",
  size: 8,
  color: "white",
  align: "center",
  bold: false,
  italic: false,
  ...overrides,
});

describe("the title element", () => {
  it("is the text box tied to the cookbook's name", () => {
    const title = text({ id: "title", role: "title", text: "" });
    const elements: CoverElement[] = [text(), title];

    expect(isTitle(title)).toBe(true);
    expect(isTitle(text())).toBe(false);
    expect(titleElement(elements)).toBe(title);
    expect(titleElement([text()])).toBeNull();
  });
});

describe("titleScale", () => {
  it("leaves an ordinary name at the size its owner chose", () => {
    expect(titleScale("Dinner")).toBe(1);
    expect(titleScale("Weeknight Dinners")).toBe(1);
  });

  // The same box has to hold a long name without it running off the board.
  it("steps the type down as the name grows", () => {
    const medium = titleScale("x".repeat(40));
    const long = titleScale("x".repeat(80));

    expect(medium).toBeLessThan(1);
    expect(long).toBeLessThan(medium);
    expect(long).toBeCloseTo(0.55);
  });

  // One more letter must never make the title jump.
  it("changes smoothly, never by more than a sliver per letter", () => {
    for (let n = 1; n < 80; n++) {
      const step = titleScale("x".repeat(n)) - titleScale("x".repeat(n + 1));
      expect(step).toBeGreaterThanOrEqual(0);
      expect(step).toBeLessThan(0.01);
    }
  });

  it("measures the name, not the spaces around it", () => {
    expect(titleScale(`  ${"x".repeat(20)}  `)).toBe(1);
  });
});

describe("foldAngle", () => {
  it("leaves an angle already in range alone", () => {
    expect(foldAngle(0)).toBe(0);
    expect(foldAngle(45)).toBe(45);
    expect(foldAngle(-90)).toBe(-90);
  });

  // Equal turns have to compare equal, however they were arrived at.
  it("folds a turn past the half-circle back into range", () => {
    expect(foldAngle(370)).toBe(10);
    expect(foldAngle(-190)).toBe(170);
    expect(foldAngle(725)).toBe(5);
  });

  it("gives the half-turn one name", () => {
    expect(foldAngle(180)).toBe(-180);
    expect(foldAngle(-180)).toBe(-180);
  });
});

describe("limitSentence", () => {
  // Said by the editor's panels and by the server's refusal alike.
  it("says how many of a kind a cover holds", () => {
    expect(limitSentence("sticker")).toBe(`A cover holds up to ${LIMITS.sticker} stickers.`);
    expect(limitSentence("text")).toBe(`A cover holds up to ${LIMITS.text} text boxes.`);
  });
});
