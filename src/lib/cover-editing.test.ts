import { describe, it, expect } from "vitest";
import {
  BOARD_ASPECT,
  createPhoto,
  createShape,
  createSticker,
  createText,
  duplicateElement,
  restack,
  scaleElement,
  snapAngle,
  snapToMiddle,
  stretchElement,
} from "./cover-editing";
import { LIMITS, type CoverElement, type TextElement } from "./cover-elements";

const stickers = (n: number): CoverElement[] =>
  Array.from({ length: n }, (_, i) => ({ ...createSticker([], "star")!, id: `s${i}` }));

describe("creating elements", () => {
  it("starts text in an ink that reads on the cloth", () => {
    // Worn Ruby is dark and carries white ink; Alpine Amber is light.
    expect(createText([], 1)!.color).toBe("white");
    expect(createText([], 4)!.color).toBe("cover-1");
  });

  it("refuses to add past the limit", () => {
    expect(createSticker(stickers(LIMITS.sticker), "tomato")).toBeNull();
  });

  // Three stickers added in a row should be three visible stickers.
  it("doesn't land a new element exactly on the last one", () => {
    const first = createSticker([], "tomato")!;
    const second = createSticker([first], "lemon")!;
    expect([second.x, second.y]).not.toEqual([first.x, first.y]);
  });

  it("draws a new circle round, not as wide as it is tall in fractions", () => {
    const circle = createShape([], "circle", 1)!;
    expect(circle.h).toBeCloseTo(circle.w * BOARD_ASPECT);
  });

  it("gives a photo its own proportions", () => {
    // A portrait photo, twice as tall as it is wide.
    const photo = createPhoto([], "https://x/y.jpg", 2)!;
    expect(photo.h).toBeCloseTo(photo.w * BOARD_ASPECT * 2);
  });
});

describe("snapping", () => {
  it("snaps to the middle when close, and leaves it alone otherwise", () => {
    expect(snapToMiddle(0.51)).toEqual({ value: 0.5, snapped: true });
    expect(snapToMiddle(0.6)).toEqual({ value: 0.6, snapped: false });
  });

  it("settles a turn onto the nearest 45° when close to one", () => {
    expect(snapAngle(3)).toBe(0);
    expect(snapAngle(88)).toBe(90);
    expect(snapAngle(30)).toBe(30);
    // Upside down is one angle, however it was reached.
    expect(snapAngle(-179)).toBe(180);
  });
});

describe("scaling", () => {
  const text = createText([], 1)!;

  it("grows a text box's type along with its width", () => {
    const scaled = scaleElement(text, 2);
    expect(scaled.w).toBeCloseTo(text.w * 2);
    expect(scaled.size).toBeCloseTo(text.size * 2);
  });

  // Clamping each dimension separately would bend the proportions at the edges.
  it("stops at the limits without changing the proportions", () => {
    const shape = createShape([], "rect", 1)!;
    const huge = scaleElement(shape, 100);
    expect(huge.w / huge.h).toBeCloseTo(shape.w / shape.h);
    expect(Math.max(huge.w, huge.h)).toBeLessThanOrEqual(1.5);
  });

  it("never shrinks type below the smallest size", () => {
    expect((scaleElement(text, 0.01) as TextElement).size).toBeGreaterThanOrEqual(3);
  });
});

describe("stretching", () => {
  it("changes one dimension only", () => {
    const shape = createShape([], "rect", 1)!;
    const wider = stretchElement(shape, "w", 0.9);
    expect(wider.w).toBe(0.9);
    expect(wider.h).toBe(shape.h);
  });

  it("leaves a sticker square", () => {
    const sticker = createSticker([], "heart")!;
    expect(stretchElement(sticker, "h", 0.9)).toEqual(sticker);
  });
});

describe("arranging", () => {
  const list: CoverElement[] = stickers(3);

  it("moves an element up the stack by swapping with its neighbour", () => {
    expect(restack(list, "s0", "forward").map((e) => e.id)).toEqual(["s1", "s0", "s2"]);
    expect(restack(list, "s2", "forward").map((e) => e.id)).toEqual(["s0", "s1", "s2"]);
  });

  it("puts a copy directly above the original, nudged so it shows", () => {
    const result = duplicateElement(list, "s0")!;
    expect(result.elements.map((e) => e.id)).toEqual(["s0", result.copy.id, "s1", "s2"]);
    expect(result.copy.x).toBeCloseTo(list[0].x + 0.04);
  });

  it("won't duplicate past the limit", () => {
    expect(duplicateElement(stickers(LIMITS.sticker), "s0")).toBeNull();
  });
});
