import { describe, it, expect } from "vitest";
import {
  formatIngredient,
  formatMinutes,
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
