import { describe, it, expect } from "vitest";
import { canAddRecipes } from "./permissions";

describe("canAddRecipes", () => {
  it("allows an OWNER", () => {
    expect(canAddRecipes("OWNER")).toBe(true);
  });

  it("allows an EDITOR", () => {
    expect(canAddRecipes("EDITOR")).toBe(true);
  });

  it("refuses a VIEWER — the schema calls them read-only", () => {
    expect(canAddRecipes("VIEWER")).toBe(false);
  });
});
