import { describe, it, expect } from "vitest";
import {
  coverElementsFieldSchema,
  coverElementsSchema,
  parseStoredElements,
} from "./cover-elements-schema";
import { LIMITS } from "./cover-elements";

const BLOB = "https://abc123.public.blob.vercel-storage.com/cookbook-covers/a.jpg";

const text = (overrides: Record<string, unknown> = {}) => ({
  id: "t1",
  type: "text",
  x: 0.5,
  y: 0.5,
  w: 0.6,
  rotation: 0,
  text: "Grandma's",
  font: "SERIF",
  size: 8,
  color: "white",
  align: "center",
  bold: false,
  italic: false,
  ...overrides,
});

const sticker = (id: string) => ({
  id,
  type: "sticker",
  x: 0.5,
  y: 0.5,
  w: 0.25,
  rotation: 0,
  sticker: "tomato",
});

describe("coverElementsSchema — continuous values are clamped", () => {
  // A drag that lands a hair outside the board is a rounding artefact, not a
  // reason to fail someone's save.
  it("pulls a centre back onto the board", () => {
    const [el] = coverElementsSchema.parse([text({ x: 1.3, y: -0.2 })]);
    expect(el.x).toBe(1);
    expect(el.y).toBe(0);
  });

  it("keeps type within the sizes the editor offers", () => {
    const [el] = coverElementsSchema.parse([text({ size: 400 })]);
    expect(el.type === "text" && el.size).toBe(24);
  });

  it("folds any angle into -180..180", () => {
    expect(coverElementsSchema.parse([text({ rotation: 370 })])[0].rotation).toBe(10);
    expect(coverElementsSchema.parse([text({ rotation: -190 })])[0].rotation).toBe(170);
  });
});

describe("coverElementsSchema — vocabularies are refused", () => {
  // These only come from controls that rendered the option, so a value outside
  // them is a hand-made request.
  it("refuses a colour outside the palette", () => {
    const result = coverElementsSchema.safeParse([text({ color: "#ff00ff" })]);
    expect(result.success).toBe(false);
  });

  it("refuses a sticker that doesn't exist", () => {
    const result = coverElementsSchema.safeParse([{ ...sticker("s1"), sticker: "skull" }]);
    expect(result.success).toBe(false);
  });

  it("refuses a placed photo from anywhere but our own store", () => {
    const photo = { id: "p1", type: "photo", x: 0.5, y: 0.5, w: 0.4, h: 0.3, rotation: 0, mask: "rect" };
    expect(coverElementsSchema.safeParse([{ ...photo, url: BLOB }]).success).toBe(true);
    expect(
      coverElementsSchema.safeParse([{ ...photo, url: "https://evil.example.com/x.jpg" }]).success,
    ).toBe(false);
  });
});

describe("coverElementsSchema — limits", () => {
  it("holds a cover to its sticker limit", () => {
    const stickers = Array.from({ length: LIMITS.sticker + 1 }, (_, i) => sticker(`s${i}`));
    const result = coverElementsSchema.safeParse(stickers);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("A cover can hold up to 8 stickers.");
    }
  });

  it("refuses two elements with one id", () => {
    expect(coverElementsSchema.safeParse([sticker("s1"), sticker("s1")]).success).toBe(false);
  });

  // An empty text box draws nothing and can't be grabbed again.
  it("drops a text box with nothing in it", () => {
    expect(coverElementsSchema.parse([text({ text: "   " }), sticker("s1")])).toHaveLength(1);
  });
});

describe("coverElementsFieldSchema — the posted field", () => {
  it("reads absent or empty as nothing placed", () => {
    expect(coverElementsFieldSchema.parse(undefined)).toEqual([]);
    expect(coverElementsFieldSchema.parse("")).toEqual([]);
  });

  it("refuses something that isn't JSON", () => {
    expect(coverElementsFieldSchema.safeParse("[{").success).toBe(false);
  });

  it("keeps the order it was given, which is the stacking order", () => {
    const parsed = coverElementsFieldSchema.parse(
      JSON.stringify([sticker("bottom"), sticker("top")]),
    );
    expect(parsed.map((e) => e.id)).toEqual(["bottom", "top"]);
  });
});

describe("parseStoredElements — reading a row", () => {
  // Losing one sticker to a bad row is a far smaller problem than losing every
  // photo beside it.
  it("skips an unreadable element and keeps the rest", () => {
    const parsed = parseStoredElements([sticker("ok"), { type: "hologram" }]);
    expect(parsed.map((e) => e.id)).toEqual(["ok"]);
  });

  it("treats anything but a list as nothing placed", () => {
    expect(parseStoredElements(null)).toEqual([]);
    expect(parseStoredElements({ not: "a list" })).toEqual([]);
  });
});
