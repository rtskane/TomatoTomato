import { describe, it, expect } from "vitest";
import {
  normalizeUsername,
  usernameSchema,
  optionalNameSchema,
  onboardingSchema,
} from "./username";

describe("normalizeUsername", () => {
  it("trims and lowercases", () => {
    expect(normalizeUsername("  ChefRyan  ")).toBe("chefryan");
  });
});

describe("usernameSchema", () => {
  it("accepts a valid handle", () => {
    const r = usernameSchema.safeParse("chef_ryan");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("chef_ryan");
  });

  it("normalizes case and surrounding whitespace", () => {
    const r = usernameSchema.safeParse("  ChefRyan ");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("chefryan");
  });

  it("allows underscores after the first letter", () => {
    expect(usernameSchema.safeParse("a_b").success).toBe(true);
  });

  it("rejects fewer than 3 characters", () => {
    expect(usernameSchema.safeParse("ab").success).toBe(false);
  });

  it("rejects more than 20 characters", () => {
    expect(usernameSchema.safeParse("a".repeat(21)).success).toBe(false);
  });

  it("rejects a leading non-letter", () => {
    expect(usernameSchema.safeParse("1chef").success).toBe(false);
    expect(usernameSchema.safeParse("_chef").success).toBe(false);
  });

  it.each(["chef-ryan", "chef ryan", "chef!", "chef.ryan", "café"])(
    "rejects disallowed characters: %s",
    (value) => {
      expect(usernameSchema.safeParse(value).success).toBe(false);
    },
  );

  it.each(["admin", "ADMIN", " Admin ", "dashboard", "onboarding", "tomato"])(
    "rejects reserved handle: %s",
    (value) => {
      expect(usernameSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe("optionalNameSchema", () => {
  it("trims a provided name", () => {
    const r = optionalNameSchema.safeParse("  Ryan ");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("Ryan");
  });

  it("turns empty / whitespace-only into undefined", () => {
    expect(optionalNameSchema.safeParse("")).toMatchObject({
      success: true,
      data: undefined,
    });
    expect(optionalNameSchema.safeParse("   ")).toMatchObject({
      success: true,
      data: undefined,
    });
  });

  it("accepts an omitted value", () => {
    expect(optionalNameSchema.safeParse(undefined).success).toBe(true);
  });

  it("rejects names longer than 50 characters", () => {
    expect(optionalNameSchema.safeParse("a".repeat(51)).success).toBe(false);
  });
});

describe("onboardingSchema", () => {
  it("parses a full valid payload with normalization", () => {
    const r = onboardingSchema.safeParse({
      username: "  ChefRyan ",
      firstName: " Ryan ",
      lastName: "",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.username).toBe("chefryan");
      expect(r.data.firstName).toBe("Ryan");
      expect(r.data.lastName).toBeUndefined();
    }
  });

  it("fails when the username is invalid", () => {
    const r = onboardingSchema.safeParse({
      username: "ab",
      firstName: "",
      lastName: "",
    });
    expect(r.success).toBe(false);
  });
});
