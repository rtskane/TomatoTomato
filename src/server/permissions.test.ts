import { describe, it, expect } from "vitest";
import {
  canAddRecipes,
  canManageMembers,
  canModifyRecipe,
  canEditCookbook,
} from "./permissions";

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

describe("canModifyRecipe", () => {
  it("lets an EDITOR change a recipe they wrote", () => {
    expect(canModifyRecipe("EDITOR", true)).toBe(true);
  });

  // The distinction canAddRecipes alone could never draw.
  it("stops an EDITOR changing someone else's", () => {
    expect(canModifyRecipe("EDITOR", false)).toBe(false);
  });

  it("lets an OWNER change any recipe, authored or not", () => {
    expect(canModifyRecipe("OWNER", true)).toBe(true);
    expect(canModifyRecipe("OWNER", false)).toBe(true);
  });

  // Read-only means read-only, even for something you wrote before being
  // demoted.
  it("stops a VIEWER changing even their own", () => {
    expect(canModifyRecipe("VIEWER", true)).toBe(false);
  });

  it("is narrower than canAddRecipes", () => {
    expect(canAddRecipes("EDITOR")).toBe(true);
    expect(canModifyRecipe("EDITOR", false)).toBe(false);
  });
});

describe("canEditCookbook", () => {
  it("allows an OWNER", () => {
    expect(canEditCookbook("OWNER")).toBe(true);
  });

  // Renaming or archiving changes the thing everyone else agreed to join.
  it("refuses an EDITOR", () => {
    expect(canEditCookbook("EDITOR")).toBe(false);
  });

  it("refuses a VIEWER", () => {
    expect(canEditCookbook("VIEWER")).toBe(false);
  });
});
