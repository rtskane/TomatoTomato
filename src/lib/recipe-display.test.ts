import { describe, it, expect } from "vitest";
import {
  formatIngredient,
  formatMinutes,
  formatQuantity,
  unitFor,
  totalMinutes,
} from "./recipe-display";

describe("formatIngredient", () => {
  it("joins quantity, unit and name", () => {
    expect(
      formatIngredient({ quantity: "200", unit: "g", name: "spaghetti" }),
    ).toBe("200 g spaghetti");
  });

  it("drops a missing unit without leaving a double space", () => {
    expect(formatIngredient({ quantity: "2", unit: "", name: "eggs" })).toBe(
      "2 eggs",
    );
  });

  it("renders a bare name when there's no quantity", () => {
    expect(formatIngredient({ quantity: "", unit: "", name: "salt" })).toBe(
      "salt",
    );
  });

  it("handles a unit with no quantity", () => {
    expect(
      formatIngredient({ quantity: "", unit: "pinch", name: "salt" }),
    ).toBe("pinch salt");
  });

  it("trims each part", () => {
    expect(
      formatIngredient({ quantity: " 200 ", unit: " g ", name: " flour " }),
    ).toBe("200 g flour");
  });

  it("returns an empty string when everything is blank", () => {
    expect(formatIngredient({ quantity: "", unit: "", name: "" })).toBe("");
  });
});

describe("formatMinutes", () => {
  it("renders sub-hour durations as minutes", () => {
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(1)).toBe("1 min");
  });

  it("renders a whole hour without a stray 0 min", () => {
    expect(formatMinutes(60)).toBe("1 hr");
    expect(formatMinutes(120)).toBe("2 hr");
  });

  // "90 min" reads as arithmetic; "1 hr 30 min" reads as cooking.
  it("splits past an hour", () => {
    expect(formatMinutes(90)).toBe("1 hr 30 min");
    expect(formatMinutes(75)).toBe("1 hr 15 min");
    expect(formatMinutes(185)).toBe("3 hr 5 min");
  });

  it("returns null for absent or nonsensical values", () => {
    expect(formatMinutes(null)).toBeNull();
    expect(formatMinutes(0)).toBeNull();
    expect(formatMinutes(-5)).toBeNull();
  });
});

describe("totalMinutes", () => {
  it("adds prep and cook", () => {
    expect(totalMinutes(15, 30)).toBe(45);
  });

  it("still totals when only one is known", () => {
    expect(totalMinutes(15, null)).toBe(15);
    expect(totalMinutes(null, 30)).toBe(30);
  });

  it("is null only when both are missing", () => {
    expect(totalMinutes(null, null)).toBeNull();
  });
});

describe("formatQuantity", () => {
  it("prints whole numbers plainly", () => {
    expect(formatQuantity(2)).toBe("2");
    expect(formatQuantity(200)).toBe("200");
  });

  it("is empty when there's no quantity", () => {
    expect(formatQuantity(null)).toBe("");
  });

  // A third used to print as "0.333333".
  it("turns kitchen fractions into their glyphs", () => {
    expect(formatQuantity(0.5)).toBe("½");
    expect(formatQuantity(0.25)).toBe("¼");
    expect(formatQuantity(0.75)).toBe("¾");
    expect(formatQuantity(0.125)).toBe("⅛");
    expect(formatQuantity(1 / 3)).toBe("⅓");
    expect(formatQuantity(0.333333)).toBe("⅓");
    expect(formatQuantity(0.33)).toBe("⅓");
    expect(formatQuantity(2 / 3)).toBe("⅔");
  });

  it("writes mixed numbers without a space", () => {
    expect(formatQuantity(1.5)).toBe("1½");
    expect(formatQuantity(2 + 2 / 3)).toBe("2⅔");
  });

  // What scaling leaves behind: 1/3 × 3 in floating point.
  it("snaps float noise to the whole number it means", () => {
    expect(formatQuantity((1 / 3) * 3)).toBe("1");
    expect(formatQuantity(0.1 * 3 * 10)).toBe("3");
    expect(formatQuantity(1.999)).toBe("2");
  });

  // 0.3 is not ⅓, and passing it off as one would change the recipe.
  it("keeps a decimal that isn't near a fraction", () => {
    expect(formatQuantity(0.3)).toBe("0.3");
    expect(formatQuantity(1.2)).toBe("1.2");
    expect(formatQuantity(0.1)).toBe("0.1");
  });

  it("keeps a tiny amount rather than rounding it to nothing", () => {
    expect(formatQuantity(0.004)).toBe("0.004");
  });

  // "187½ g" is an instruction; "12⅜ g" is false precision.
  it("allows only halves from 10 up, and rounds the rest", () => {
    expect(formatQuantity(187.5)).toBe("187½");
    expect(formatQuantity(12.375)).toBe("12");
    expect(formatQuantity(12.8)).toBe("13");
  });
});

describe("formatQuantity — snapping scaled amounts", () => {
  // ⅓ cup at 5 servings instead of 4. Nobody can measure "0.42 cup".
  it("snaps to the nearest fraction a cup or spoon marks", () => {
    expect(formatQuantity((1 / 3) * 1.25, { snap: true })).toBe("⅜");
    expect(formatQuantity(0.29, { snap: true })).toBe("¼");
    expect(formatQuantity(1.45, { snap: true })).toBe("1½");
  });

  it("snaps onto a whole number either side", () => {
    expect(formatQuantity(1.05, { snap: true })).toBe("1");
    expect(formatQuantity(0.95, { snap: true })).toBe("1");
  });

  // Rounding a pinch down to "0" would drop it from the recipe.
  it("never snaps a small amount down to nothing", () => {
    expect(formatQuantity(0.04, { snap: true })).toBe("0.04");
  });

  // The author's own numbers are theirs.
  it("leaves unsnapped amounts exactly as before", () => {
    expect(formatQuantity(0.3)).toBe("0.3");
    expect(formatQuantity(0.42)).toBe("0.42");
  });

  it("changes nothing that was already a fraction or 10 and up", () => {
    expect(formatQuantity(0.5, { snap: true })).toBe("½");
    expect(formatQuantity(12.3, { snap: true })).toBe("12");
  });
});

describe("unitFor", () => {
  // Halving "2 cups" used to read "1 cups".
  it("goes singular at one or less", () => {
    expect(unitFor("cups", 1)).toBe("cup");
    expect(unitFor("cups", 0.5)).toBe("cup");
    expect(unitFor("tablespoons", 0.75)).toBe("tablespoon");
  });

  it("goes plural above one, fractions included", () => {
    expect(unitFor("cup", 2)).toBe("cups");
    expect(unitFor("tablespoon", 1.5)).toBe("tablespoons");
    expect(unitFor("pinch", 2)).toBe("pinches");
    expect(unitFor("leaf", 3)).toBe("leaves");
  });

  // Scaling can leave 1.004, which prints as "1".
  it("follows the printed amount, not float noise", () => {
    expect(unitFor("cups", 1.004)).toBe("cup");
  });

  it("keeps a capital", () => {
    expect(unitFor("Cups", 1)).toBe("Cup");
  });

  // Guessing at a plural would be worse than leaving what the author wrote.
  it("leaves abbreviations and unknown units alone", () => {
    expect(unitFor("tsp", 3)).toBe("tsp");
    expect(unitFor("g", 200)).toBe("g");
    expect(unitFor("knob", 2)).toBe("knob");
    expect(unitFor("", 2)).toBe("");
  });

  // 1.05 snaps to "1", so it must read "1 cup", not "1 cups".
  it("agrees with the snapped amount", () => {
    expect(unitFor("cups", 1.05, { snap: true })).toBe("cup");
    expect(unitFor("cup", 1.05)).toBe("cups");
  });

  it("leaves the unit alone when there's no amount", () => {
    expect(unitFor("cups", null)).toBe("cups");
  });
});
