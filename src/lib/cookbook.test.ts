import { describe, it, expect } from "vitest";
import {
  cookbookTitleSchema,
  cookbookDescriptionSchema,
  coverColorSchema,
  coverStyleSchema,
  createCookbookSchema,
} from "./cookbook";
import { COVER_COUNT } from "./book-covers";

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
      // Settled by the schema even though the payload never mentioned it —
      // a cover has to render as something.
      coverStyle: "TITLED",
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

const BLOB = "https://abc123.public.blob.vercel-storage.com/cookbook-covers/x.jpg";

describe("createCookbookSchema — cover", () => {
  it("parses a cookbook with a cover", () => {
    const parsed = createCookbookSchema.parse({
      title: "Baking",
      description: "",
      coverImageUrl: BLOB,
    });
    expect(parsed.coverImageUrl).toBe(BLOB);
  });

  it("is happy with no cover field at all", () => {
    const parsed = createCookbookSchema.parse({ title: "Baking" });
    expect(parsed.coverImageUrl).toBeUndefined();
  });

  it("fails the whole cookbook when the cover is somewhere we don't host", () => {
    const result = createCookbookSchema.safeParse({
      title: "Baking",
      coverImageUrl: "https://evil.example.com/x.jpg",
    });
    expect(result.success).toBe(false);
  });
});

describe("coverColorSchema", () => {
  it("accepts a colour the palette actually has", () => {
    expect(coverColorSchema.parse("3")).toBe(3);
  });

  it("reads an empty field as unchosen rather than as zero", () => {
    expect(coverColorSchema.parse("")).toBeUndefined();
    expect(coverColorSchema.parse("  ")).toBeUndefined();
  });

  it("reads an absent field as unchosen too", () => {
    expect(coverColorSchema.parse(undefined)).toBeUndefined();
  });

  // Not something a user can trip — the designer only submits numbers it drew
  // a swatch for. This is the guard against a hand-made POST.
  it("refuses a colour outside the palette", () => {
    for (const bad of ["0", "-1", String(COVER_COUNT + 1), "1.5", "red"]) {
      expect(coverColorSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("coverStyleSchema", () => {
  it("accepts the styles the database stores", () => {
    expect(coverStyleSchema.parse("PHOTO")).toBe("PHOTO");
    expect(coverStyleSchema.parse("PLAIN")).toBe("PLAIN");
  });

  it("reads empty and absent alike as unsaid", () => {
    expect(coverStyleSchema.parse("")).toBeUndefined();
    expect(coverStyleSchema.parse(undefined)).toBeUndefined();
  });

  it("refuses a style that isn't one", () => {
    expect(coverStyleSchema.safeParse("titled").success).toBe(false);
    expect(coverStyleSchema.safeParse("FANCY").success).toBe(false);
  });
});

describe("createCookbookSchema — settling the cover style", () => {
  it("keeps the style the designer chose", () => {
    const parsed = createCookbookSchema.parse({
      title: "Baking",
      coverColor: "4",
      coverStyle: "PLAIN",
    });
    expect(parsed).toMatchObject({ coverColor: 4, coverStyle: "PLAIN" });
  });

  // The pre-designer rule, so adding these fields broke no existing caller:
  // a cookbook with a picture showed the picture, one without showed its title.
  it("infers PHOTO from a picture when the caller says nothing", () => {
    const parsed = createCookbookSchema.parse({
      title: "Baking",
      coverImageUrl: BLOB,
    });
    expect(parsed.coverStyle).toBe("PHOTO");
  });

  it("infers TITLED with no picture and nothing said", () => {
    expect(createCookbookSchema.parse({ title: "Baking" }).coverStyle).toBe(
      "TITLED",
    );
  });

  // Nothing for the user to fix — it means the upload failed or the image was
  // removed after the style was picked. Refusing the save would hold their
  // title and description hostage to it.
  it("folds PHOTO-with-no-picture back to TITLED instead of failing", () => {
    const result = createCookbookSchema.safeParse({
      title: "Baking",
      coverStyle: "PHOTO",
      coverImageUrl: "",
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.coverStyle).toBe("TITLED");
  });
});
