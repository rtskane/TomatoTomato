import { describe, it, expect } from "vitest";
import {
  cookbookTitleSchema,
  cookbookDescriptionSchema,
  createCookbookSchema,
} from "./cookbook";

describe("cookbookTitleSchema", () => {
  it("accepts a normal title", () => {
    expect(cookbookTitleSchema.parse("Weeknight Dinners")).toBe(
      "Weeknight Dinners",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(cookbookTitleSchema.parse("  Weeknight Dinners  ")).toBe(
      "Weeknight Dinners",
    );
  });

  it("preserves the user's casing (titles are not normalized like usernames)", () => {
    expect(cookbookTitleSchema.parse("BBQ & Grilling")).toBe("BBQ & Grilling");
  });

  it("rejects an empty title", () => {
    expect(cookbookTitleSchema.safeParse("").success).toBe(false);
  });

  it("rejects a whitespace-only title", () => {
    expect(cookbookTitleSchema.safeParse("   ").success).toBe(false);
  });

  it("rejects titles longer than 80 characters", () => {
    expect(cookbookTitleSchema.safeParse("x".repeat(81)).success).toBe(false);
  });

  it("accepts a title of exactly 80 characters", () => {
    expect(cookbookTitleSchema.safeParse("x".repeat(80)).success).toBe(true);
  });
});

describe("cookbookDescriptionSchema", () => {
  it("trims a provided description", () => {
    expect(cookbookDescriptionSchema.parse("  Fast meals.  ")).toBe(
      "Fast meals.",
    );
  });

  it("turns empty / whitespace-only into undefined", () => {
    expect(cookbookDescriptionSchema.parse("")).toBeUndefined();
    expect(cookbookDescriptionSchema.parse("   ")).toBeUndefined();
  });

  it("accepts an omitted value", () => {
    expect(cookbookDescriptionSchema.parse(undefined)).toBeUndefined();
  });

  it("rejects descriptions longer than 500 characters", () => {
    expect(cookbookDescriptionSchema.safeParse("x".repeat(501)).success).toBe(
      false,
    );
  });
});

describe("createCookbookSchema", () => {
  it("parses a full valid payload", () => {
    const parsed = createCookbookSchema.parse({
      title: "  Weeknight Dinners ",
      description: " Fast meals. ",
    });
    expect(parsed).toEqual({
      title: "Weeknight Dinners",
      description: "Fast meals.",
    });
  });

  it("leaves description undefined when blank", () => {
    const parsed = createCookbookSchema.parse({
      title: "Weeknight Dinners",
      description: "",
    });
    expect(parsed.description).toBeUndefined();
  });

  it("fails when the title is missing", () => {
    expect(
      createCookbookSchema.safeParse({ title: "", description: "" }).success,
    ).toBe(false);
  });
});
