import { describe, it, expect } from "vitest";
import { DEFAULT_COVER_DESIGN, type CoverDesign } from "./book-covers";
import { createCookbookSchema } from "./cookbook";
import { createTitle } from "./cover-editing";
import { COVER_FIELD_NAMES, coverFields, coverFieldsFrom } from "./cover-fields";

const cover = (overrides: Partial<CoverDesign> = {}): CoverDesign => ({
  ...DEFAULT_COVER_DESIGN,
  coverColor: 2,
  ...overrides,
});

describe("the cover's field names", () => {
  // One list for everything that sends or receives a cover. It has to be the
  // schema's own cover fields — no more, no fewer — or a field would be sent
  // and ignored, or expected and never sent.
  it("are exactly the cover fields the cookbook schema takes", () => {
    const parsed = createCookbookSchema.parse({ title: "Soups", ...coverFields(cover()) });
    const coverKeys = Object.keys(parsed).filter((k) => k !== "title" && k !== "description");

    expect([...COVER_FIELD_NAMES].sort()).toEqual(coverKeys.sort());
  });
});

describe("coverFields", () => {
  it("carries every part of the design as a string", () => {
    const title = createTitle([], 2)!;
    const fields = coverFields(cover({ coverTexture: "GINGHAM", coverElements: [title] }));

    expect(Object.keys(fields).sort()).toEqual([...COVER_FIELD_NAMES].sort());
    expect(fields.coverColor).toBe("2");
    expect(fields.coverTexture).toBe("GINGHAM");
    expect(fields.coverImageUrl).toBe("");
    expect(JSON.parse(fields.coverElements)).toEqual([title]);
  });

  // An older cover keeps its title on the plate: TITLED with no title
  // element. Posting it must not "correct" that to PLAIN — that would strip
  // the title off a cookbook whose owner only renamed it.
  it("carries the style as it stands, never re-deriving it", () => {
    expect(coverFields(cover({ coverStyle: "TITLED" })).coverStyle).toBe("TITLED");
    expect(coverFields(cover({ coverStyle: "PLAIN" })).coverStyle).toBe("PLAIN");
  });

  it("survives the trip through the schema unchanged", () => {
    const design = cover({ coverTexture: "GRID", coverElements: [createTitle([], 2)!] });
    const parsed = createCookbookSchema.parse({ title: "Soups", ...coverFields(design) });

    expect(parsed).toMatchObject({
      coverColor: 2,
      coverStyle: "TITLED",
      coverTexture: "GRID",
      coverElements: design.coverElements,
    });
  });
});

describe("coverFieldsFrom", () => {
  it("reads each cover field out of a posted form", () => {
    const form = new FormData();
    for (const [name, value] of Object.entries(coverFields(cover({ coverTexture: "GRID" })))) {
      form.set(name, value);
    }
    form.set("title", "Soups");

    expect(coverFieldsFrom(form)).toEqual(coverFields(cover({ coverTexture: "GRID" })));
  });

  // A request that never came from the settings form: every field empty,
  // which the schema reads as "not said".
  it("gives an empty string for a field the form doesn't have", () => {
    const fields = coverFieldsFrom(new FormData());

    expect(Object.keys(fields).sort()).toEqual([...COVER_FIELD_NAMES].sort());
    expect(Object.values(fields).every((v) => v === "")).toBe(true);
  });
});
