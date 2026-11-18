import { describe, it, expect } from "vitest";
import { derivedCoverColor } from "./book-covers";
import { toCoverDesign, type StoredCover } from "./stored-cover";

const row = (overrides: Partial<StoredCover> = {}): StoredCover => ({
  id: "cb1",
  coverImageUrl: null,
  coverColor: 3,
  coverStyle: "TITLED",
  coverTexture: "NONE",
  coverTitleFont: "SERIF",
  coverTitleSize: "MEDIUM",
  coverTitlePosition: "CENTER",
  coverFocalX: 0.5,
  coverFocalY: 0.5,
  coverZoom: 1,
  coverElements: [],
  ...overrides,
});

const sticker = { id: "s1", type: "sticker", x: 0.5, y: 0.5, w: 0.3, rotation: 0, sticker: "lemon" };

describe("toCoverDesign", () => {
  it("hands a view the stored cover as it is", () => {
    expect(toCoverDesign(row({ coverTexture: "GRID", coverElements: [sticker] }))).toMatchObject({
      coverColor: 3,
      coverStyle: "TITLED",
      coverTexture: "GRID",
      coverElements: [sticker],
    });
  });

  // Null means nobody chose: the colour is derived from the id, so no view
  // ever has to know null was possible.
  it("settles a colour nobody chose", () => {
    expect(toCoverDesign(row({ coverColor: null })).coverColor).toBe(derivedCoverColor("cb1"));
  });

  it("keeps the photo's framing inside the picture", () => {
    const design = toCoverDesign(row({ coverFocalX: 4, coverFocalY: -1, coverZoom: 99 }));
    expect(design).toMatchObject({ coverFocalX: 1, coverFocalY: 0, coverZoom: 3 });
  });

  // The column is plain JSON, so it can hold anything. One unreadable element
  // must not cost the cover everything else on it.
  it("drops an element it can't read and keeps the rest", () => {
    const design = toCoverDesign(row({ coverElements: [{ type: "hologram" }, sticker] }));
    expect(design.coverElements).toEqual([sticker]);
  });

  it("reads anything that isn't a list as nothing placed", () => {
    expect(toCoverDesign(row({ coverElements: null })).coverElements).toEqual([]);
    expect(toCoverDesign(row({ coverElements: "[]" })).coverElements).toEqual([]);
  });
});
