import { describe, it, expect } from "vitest";
import {
  BOOK_COVERS,
  COVER_COUNT,
  COVER_STYLES,
  COVER_TEXTURES,
  COVER_TITLE_FONTS,
  COVER_TITLE_SIZES,
  COVER_TITLE_POSITIONS,
  TEXTURES,
  TITLE_FONTS,
  TITLE_SIZES,
  TITLE_POSITIONS,
  DEFAULT_COVER_DESIGN,
  MIN_ZOOM,
  MAX_ZOOM,
  clampFraction,
  clampZoom,
  derivedCoverColor,
  isCoverColor,
  isCoverStyle,
  paletteFor,
  resolveCoverColor,
  suggestCoverColor,
} from "./book-covers";

describe("the palette", () => {
  it("numbers the covers 1..n, in order, with no gaps", () => {
    expect(BOOK_COVERS.map((c) => c.id)).toEqual(
      Array.from({ length: COVER_COUNT }, (_, i) => i + 1),
    );
  });

  // The ids are stored in the database, so a cover's number is a permanent
  // fact about it — renumbering would silently repaint everyone's library.
  it("pairs every cover with the ink meant to be read on it", () => {
    for (const cover of BOOK_COVERS) {
      expect(cover.face).toBe(`bg-book-cover-${cover.id}`);
      expect(cover.ink).toBe(`text-book-ink-${cover.id}`);
    }
  });

  // Tailwind only compiles class names it can see written out in full, so a
  // cover assembled by interpolation would render with no colour at all.
  it("spells every class out rather than building it from the id", () => {
    for (const cover of BOOK_COVERS) {
      for (const cls of [cover.shade, cover.hairline, cover.frame, cover.sheen]) {
        expect(cls).toContain(`book-ink-${cover.id}`);
      }
    }
  });

  it("gives every cover a name a person could say out loud", () => {
    const names = BOOK_COVERS.map((c) => c.name);
    expect(names.every((n) => n.length > 0)).toBe(true);
    // Duplicates would make two swatches indistinguishable to a screen reader.
    expect(new Set(names).size).toBe(COVER_COUNT);
  });
});

describe("derivedCoverColor", () => {
  // Stable, because a cookbook changing colour between visits would read as a
  // different cookbook.
  it("gives an id the same colour every time", () => {
    expect(derivedCoverColor("cb1")).toBe(derivedCoverColor("cb1"));
  });

  it("always lands inside the palette", () => {
    for (const id of ["a", "cb1", "x".repeat(50), "clx9q8w7e6r5t4y3u2i1o0"]) {
      expect(isCoverColor(derivedCoverColor(id))).toBe(true);
    }
  });

  // Cuids created moments apart differ only in their tail, which is what the
  // sum picks up — so books made together still land on different covers.
  it("spreads neighbouring ids across the whole palette", () => {
    const ids = Array.from({ length: COVER_COUNT }, (_, i) =>
      String.fromCharCode(97 + i),
    );
    expect(new Set(ids.map(derivedCoverColor)).size).toBe(COVER_COUNT);
  });
});

describe("resolveCoverColor", () => {
  it("uses the stored choice when there is one", () => {
    expect(resolveCoverColor("cb1", 5)).toBe(5);
  });

  it("falls back to the derived colour when nobody has chosen", () => {
    expect(resolveCoverColor("cb1", null)).toBe(derivedCoverColor("cb1"));
    expect(resolveCoverColor("cb1", undefined)).toBe(derivedCoverColor("cb1"));
  });

  // The column is a bare int with no CHECK constraint. A cover that renders in
  // the wrong colour beats a dashboard that throws.
  it("falls back rather than throwing on a value outside the palette", () => {
    for (const bad of [0, -1, COVER_COUNT + 1, 1.5, Number.NaN]) {
      expect(resolveCoverColor("cb1", bad)).toBe(derivedCoverColor("cb1"));
    }
  });
});

describe("paletteFor", () => {
  it("returns the cover with that number", () => {
    expect(paletteFor(3).id).toBe(3);
  });

  it("returns a real cover even when handed a number that isn't one", () => {
    expect(paletteFor(0).face).toContain("bg-book-cover-");
    expect(paletteFor(COVER_COUNT + 1).face).toContain("bg-book-cover-");
  });
});

describe("suggestCoverColor", () => {
  it("only ever suggests a colour that exists", () => {
    for (let i = 0; i < 200; i++) {
      expect(isCoverColor(suggestCoverColor())).toBe(true);
    }
  });

  // The whole reason it is random: a fixed default would make every cookbook
  // whose owner ignored the designer come out the same colour.
  it("does not always suggest the same one", () => {
    const seen = new Set(Array.from({ length: 200 }, suggestCoverColor));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("the composed vocabulary", () => {
  it("gives each texture a label, and only the weaves a class", () => {
    expect(TEXTURES.NONE.className).toBeNull();
    expect(TEXTURES.LINEN.className).toBe("cover-weave-linen");
    expect(TEXTURES.GRID.className).toBe("cover-weave-grid");
    for (const t of COVER_TEXTURES) {
      expect(TEXTURES[t].label.length).toBeGreaterThan(0);
    }
  });

  // Two controls answering to one name is ambiguous to anyone navigating by
  // name rather than by sight — and cover 8 is already called Linen.
  it("never labels a texture with a colour's name", () => {
    const colourNames = new Set(BOOK_COVERS.map((c) => c.name));
    for (const t of COVER_TEXTURES) {
      expect(colourNames.has(TEXTURES[t].label)).toBe(false);
    }
  });

  // The whole reason a size is an enum and not a number of pixels: the same
  // cover is drawn at 240px on the shelf and 128px in the designer.
  it("sizes the title as a percentage of the cover, never in pixels", () => {
    for (const size of COVER_TITLE_SIZES) {
      expect(TITLE_SIZES[size].className).toMatch(/cqw/);
      expect(TITLE_SIZES[size].className).not.toMatch(/px|rem/);
    }
  });

  // MEDIUM has to stay exactly what the shelf book was already set at, or
  // every undesigned cookbook changes the day this ships.
  it("keeps MEDIUM at the size covers were already printed at", () => {
    expect(TITLE_SIZES.MEDIUM.className).toBe("text-[8.3cqw]");
  });

  it("offers both of the theme's families and no third one", () => {
    expect(COVER_TITLE_FONTS).toEqual(["SERIF", "SANS"]);
    expect(TITLE_FONTS.SERIF.className).toBe("font-serif");
    expect(TITLE_FONTS.SANS.className).toBe("font-sans");
  });

  it("positions the title by alignment, so the frame itself never moves", () => {
    for (const p of COVER_TITLE_POSITIONS) {
      expect(TITLE_POSITIONS[p].className).toMatch(/^items-/);
    }
  });
});

describe("clamping what a continuous control posts", () => {
  it("keeps a focal point inside the picture", () => {
    expect(clampFraction(0.25)).toBe(0.25);
    expect(clampFraction(-1)).toBe(0);
    expect(clampFraction(4)).toBe(1);
  });

  it("falls back to the centre for a value that isn't a number", () => {
    expect(clampFraction(Number.NaN)).toBe(0.5);
    expect(clampFraction(Number.POSITIVE_INFINITY)).toBe(0.5);
  });

  it("keeps zoom within what the slider offers", () => {
    expect(clampZoom(2)).toBe(2);
    expect(clampZoom(0.1)).toBe(MIN_ZOOM);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
    expect(clampZoom(Number.NaN)).toBe(MIN_ZOOM);
  });
});

describe("DEFAULT_COVER_DESIGN", () => {
  // These are the values the migration wrote as the columns' defaults. If the
  // two drift apart, a cookbook renders one way before its first save and a
  // different way after it.
  it("matches the columns' defaults, so nothing changes on first save", () => {
    expect(DEFAULT_COVER_DESIGN).toEqual({
      coverStyle: "TITLED",
      coverImageUrl: null,
      coverTexture: "NONE",
      coverTitleFont: "SERIF",
      coverTitleSize: "MEDIUM",
      coverTitlePosition: "CENTER",
      coverFocalX: 0.5,
      coverFocalY: 0.5,
      coverZoom: 1,
    });
  });
});

describe("isCoverStyle", () => {
  it("accepts the styles the schema stores", () => {
    for (const style of COVER_STYLES) expect(isCoverStyle(style)).toBe(true);
  });

  it("refuses anything else", () => {
    for (const bad of ["", "titled", "PHOTOS", "DROP TABLE"]) {
      expect(isCoverStyle(bad)).toBe(false);
    }
  });
});
