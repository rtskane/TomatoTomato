import { describe, it, expect } from "vitest";
import {
  asFreeform,
  BOARD_ASPECT,
  createPhoto,
  createShape,
  createSticker,
  createText,
  createTitle,
  duplicateElement,
  inkAt,
  isHollow,
  onOutline,
  reink,
  restack,
  scaleElement,
  snapAngle,
  snapToMiddle,
  stretchElement,
  styleFor,
} from "./cover-editing";
import { DEFAULT_COVER_DESIGN, TITLE_SIZES, type CoverDesign } from "./book-covers";
import { titleElement } from "./cover-elements";
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

const cover = (overrides: Partial<CoverDesign> = {}): CoverDesign => ({
  ...DEFAULT_COVER_DESIGN,
  coverColor: 2,
  ...overrides,
});

describe("the cookbook's name as an element", () => {
  it("is a text box tied to the name, in an ink that reads", () => {
    const title = createTitle([], 4)!;
    expect(title.role).toBe("title");
    expect(title.text).toBe("");
    expect(title.color).toBe("cover-1");
  });

  it("can only be placed once", () => {
    const title = createTitle([], 2)!;
    expect(createTitle([title], 2)).toBeNull();
  });

  // There is one name, so there is no second copy of it to make.
  it("can't be duplicated", () => {
    const title = createTitle([], 2)!;
    expect(duplicateElement([title], title.id)).toBeNull();
  });
});

describe("opening an older cover", () => {
  it("rebuilds the title plate out of elements", () => {
    const freeform = asFreeform(cover({ coverTitleFont: "SANS", coverTitleSize: "LARGE" }));
    const [frame, title] = freeform.coverElements;

    expect(frame).toMatchObject({ type: "shape", shape: "frame", color: "white" });
    expect(title).toMatchObject({ type: "text", role: "title", font: "SANS", size: 11 });
  });

  it("puts the name where the plate had it", () => {
    const y = (position: CoverDesign["coverTitlePosition"]) =>
      titleElement(asFreeform(cover({ coverTitlePosition: position })).coverElements)!.y;

    expect(y("TOP")).toBeLessThan(y("CENTER"));
    expect(y("CENTER")).toBeLessThan(y("BOTTOM"));
  });

  it("puts the plate under whatever was already placed", () => {
    const star = createSticker([], "star")!;
    const freeform = asFreeform(cover({ coverElements: [star] }));
    expect(freeform.coverElements.at(-1)).toBe(star);
    expect(freeform.coverElements).toHaveLength(3);
  });

  // A plain or photo cover never showed its title, so opening it must not
  // make one appear.
  it("adds no title to a cover that never showed one", () => {
    expect(asFreeform(cover({ coverStyle: "PLAIN" })).coverElements).toEqual([]);
    expect(
      asFreeform(cover({ coverStyle: "PHOTO", coverImageUrl: "https://x/a.jpg" })).coverElements,
    ).toEqual([]);
  });

  // The plate's type sizes are written twice — as Tailwind classes the book
  // draws with, and as the numbers a converted title starts at. If they ever
  // disagree, opening an old cover in the editor would resize its title.
  it("sets the title in exactly the size the plate drew it", () => {
    for (const size of ["SMALL", "MEDIUM", "LARGE"] as const) {
      const drawn = Number(/text-\[([\d.]+)cqw\]/.exec(TITLE_SIZES[size].className)![1]);
      const title = titleElement(asFreeform(cover({ coverTitleSize: size })).coverElements)!;
      expect(title.size).toBe(drawn);
    }
  });

  it("leaves a cover alone once its title is an element", () => {
    const design = asFreeform(cover());
    expect(asFreeform(design)).toBe(design);
  });

  // The old designer kept an uploaded picture around while another style was
  // chosen. The editor has no hidden picture, so it is let go.
  it("lets go of a picture the cover wasn't showing", () => {
    const freeform = asFreeform(cover({ coverStyle: "PLAIN", coverImageUrl: "https://x/a.jpg" }));
    expect(freeform.coverImageUrl).toBeNull();
  });
});

describe("the style a cover is stored under", () => {
  const title = createTitle([], 2)!;

  it("is PHOTO when a picture fills the board", () => {
    expect(styleFor({ coverImageUrl: "https://x/a.jpg", coverElements: [title] })).toBe("PHOTO");
  });

  // What tells a client that can't draw elements to show the name the old way.
  it("is TITLED when the name is on the cover", () => {
    expect(styleFor({ coverImageUrl: null, coverElements: [title] })).toBe("TITLED");
  });

  it("is PLAIN when it isn't", () => {
    expect(styleFor({ coverImageUrl: null, coverElements: [] })).toBe("PLAIN");
  });
});

describe("moving a cover to another cloth", () => {
  const white = { ...createText([], 2)!, id: "a" };
  const label = { ...createShape([], "rect", 4)!, id: "b" };
  const red = { ...createShape([], "circle", 2)!, id: "c", color: "cover-2" as const };

  // Garnet carries white ink, Linen the dark neutral.
  it("trades white for dark, and dark for white, when the ink flips", () => {
    const [a, b] = reink([white, label], 2, 8);
    expect(a).toMatchObject({ color: "cover-1" });
    expect(b).toMatchObject({ color: "white" });
  });

  it("leaves everything alone between two cloths of the same ink", () => {
    expect(reink([white, label], 2, 6)).toEqual([white, label]);
  });

  it("never touches a colour somebody chose", () => {
    expect(reink([red], 2, 8)).toEqual([red]);
  });

  it("leaves stickers and photos as they are", () => {
    const star = createSticker([], "star")!;
    expect(reink([star], 2, 8)).toEqual([star]);
  });
});

describe("a thin rule stays thin", () => {
  const line = createShape([], "line", 2)!;

  // Held to the general minimum, pulling a line's corner made it jump to
  // three times its thickness before it had moved at all.
  it("scales from the size it is, not from a minimum it never met", () => {
    expect(scaleElement(line, 1)).toEqual(line);
    const grown = scaleElement(line, 1.1);
    expect(grown.h).toBeCloseTo(line.h * 1.1);
  });

  it("can be stretched thinner than a photo could be", () => {
    expect(stretchElement(line, "h", 0.001).h).toBe(0.008);
  });
});

describe("the colour something new starts in", () => {
  const label = { ...createShape([], "rect", 2)!, id: "label", x: 0.5, y: 0.45, w: 0.7, h: 0.34 };

  it("is the cloth's ink on bare cloth", () => {
    expect(inkAt([], 2, 0.5, 0.45)).toBe("white");
    expect(inkAt([], 8, 0.5, 0.45)).toBe("cover-1");
  });

  // A new text box lands in the middle — on the label. In the cloth's ink it
  // was white on white, and looked like nothing had been added.
  it("is the ink of the label it lands on", () => {
    expect(label.color).toBe("white");
    expect(inkAt([label], 2, 0.5, 0.45)).toBe("cover-1");
    expect(createText([label], 2)!.color).toBe("cover-1");
  });

  it("goes back to the cloth's ink beside the label", () => {
    expect(inkAt([label], 2, 0.5, 0.95)).toBe("white");
  });

  it("reads on a label of any colour", () => {
    expect(inkAt([{ ...label, color: "cover-8" }], 2, 0.5, 0.45)).toBe("cover-1");
    expect(inkAt([{ ...label, color: "cover-6" }], 8, 0.5, 0.45)).toBe("white");
  });

  it("is decided by the topmost thing under it", () => {
    const patch = { ...label, id: "patch", color: "cover-1" as const };
    expect(inkAt([label, patch], 2, 0.5, 0.45)).toBe("white");
  });

  // A frame or an outline has nothing in its middle to sit on.
  it("looks through shapes that are only a line", () => {
    const frame = { ...createShape([], "frame", 8)!, x: 0.5, y: 0.5 };
    const ring = { ...label, id: "ring", outline: true, color: "cover-1" as const };
    expect(inkAt([frame, ring], 2, 0.5, 0.5)).toBe("white");
  });
});

describe("pressing a hollow shape", () => {
  const board = { width: 400, height: 533 };
  const frame = { ...createShape([], "frame", 2)!, w: 0.8, h: 0.9 };
  const ring = { ...createShape([], "circle", 2)!, outline: true, w: 0.5, h: 0.375 };

  it("knows which shapes are only a line", () => {
    expect(isHollow(frame)).toBe(true);
    expect(isHollow(ring)).toBe(true);
    expect(isHollow({ ...ring, outline: false })).toBe(false);
    expect(isHollow(createShape([], "rect", 2)!)).toBe(false);
    // A triangle has no outline form, whatever the flag says.
    expect(isHollow({ ...createShape([], "triangle", 2)!, outline: true })).toBe(false);
    expect(isHollow(createSticker([], "star")!)).toBe(false);
  });

  // A frame can be nearly the size of the cover. Its middle has to let a
  // press through to what is underneath.
  it("misses in the empty middle of a frame", () => {
    expect(onOutline(frame, 0, 0, board)).toBe(false);
    expect(onOutline(frame, 100, -150, board)).toBe(false);
  });

  it("lands on the frame's line, with room for a finger", () => {
    const edge = (0.8 * board.width) / 2; // 160px
    expect(onOutline(frame, edge, 0, board)).toBe(true);
    expect(onOutline(frame, edge - 6, 40, board)).toBe(true);
    expect(onOutline(frame, edge + 6, 40, board)).toBe(true);
    expect(onOutline(frame, 0, (0.9 * board.height) / 2, board)).toBe(true);
  });

  it("misses well outside the frame", () => {
    expect(onOutline(frame, 190, 0, board)).toBe(false);
  });

  it("follows the curve of a ring", () => {
    const radius = (0.5 * board.width) / 2; // 100px, both ways on a 3:4 board
    expect(onOutline(ring, 0, 0, board)).toBe(false);
    expect(onOutline(ring, radius, 0, board)).toBe(true);
    expect(onOutline(ring, radius * Math.SQRT1_2, radius * Math.SQRT1_2, board)).toBe(true);
    // The corner of its box is nowhere near the line.
    expect(onOutline(ring, radius, radius, board)).toBe(false);
  });

  // A frame turned a quarter of the way round is wide where it was tall. The
  // press is given in screen pixels, so the turning back is this function's
  // job, and a point on the turned line has to land.
  it("follows a shape that has been turned", () => {
    const turned = { ...frame, rotation: 90 };
    const longHalf = (0.9 * board.height) / 2; // ~240px, now across the screen

    expect(onOutline(turned, longHalf, 0, board)).toBe(true);
    // Where the unturned frame's side was is now empty middle…
    expect(onOutline(turned, (0.8 * board.width) / 2, 0, board)).toBe(false);
    // …and the unturned frame agrees it is the other way round.
    expect(onOutline(frame, longHalf, 0, board)).toBe(false);
  });

  // No layout (a test environment): there is no middle to miss.
  it("counts as a hit when nothing has been laid out", () => {
    expect(onOutline(ring, 0, 0, { width: 0, height: 0 })).toBe(true);
  });
});
