import { describe, it, expect } from "vitest";
import { canAddRecipes, canManageMembers } from "./permissions";

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

describe("canManageMembers", () => {
  it("allows an OWNER", () => {
    expect(canManageMembers("OWNER")).toBe(true);
  });

  // Deliberately narrower than canAddRecipes: an EDITOR can write recipes, but
  // widening who can see the cookbook is the owner's call.
  it("refuses an EDITOR", () => {
    expect(canManageMembers("EDITOR")).toBe(false);
  });

  it("refuses a VIEWER", () => {
    expect(canManageMembers("VIEWER")).toBe(false);
  });
});
