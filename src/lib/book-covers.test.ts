import { describe, it, expect } from "vitest";
import {
  BOOK_COVERS,
  COVER_COUNT,
  COVER_STYLES,
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
