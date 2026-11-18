import { DEFAULT_COVER_DESIGN, type CoverDesign, type CoverTexture } from "@/lib/book-covers";
import {
  BOARD_CENTRE_X,
  inkFor,
  type CoverElement,
  type ElementColor,
  type ShapeElement,
  type StickerElement,
  type StickerName,
  type TextElement,
} from "@/lib/cover-elements";

// The ready-made covers a new cookbook can start from.
//
// A template is not a second kind of cover. It is a function that returns an
// ordinary `CoverDesign` — the same colour, weave and placed elements the
// editor produces — so "use this template" and "customise this template" are
// the same data, one saved as it is and one opened in the editor first.
// Nothing about a cookbook records which template it came from.
//
// Each lays out its elements for a given cloth, because what reads on a cover
// depends on it: the ink is white on the dark cloths and near-black on the
// pale ones (`inkFor`), and a label or band has to be the opposite of whatever
// it sits on. Writing a template against "the cloth's ink" rather than a
// literal colour is what keeps its name legible if its cloth is ever changed.
//
// Framework-free, like the rest of lib/, so the picker, the server and the
// tests share one list.

/** White on a dark cloth, the darkest cover on a pale one — and the reverse. */
function paper(color: number): ElementColor {
  return inkFor(color) === "white" ? "white" : "cover-1";
}
function onPaper(color: number): ElementColor {
  return inkFor(color) === "white" ? "cover-1" : "white";
}

const CX = BOARD_CENTRE_X;

function title(overrides: Partial<TextElement> & Pick<TextElement, "color">): TextElement {
  return {
    id: "title",
    type: "text",
    role: "title",
    x: CX,
    y: 0.5,
    w: 0.7,
    rotation: 0,
    text: "",
    font: "SERIF",
    size: 9,
    align: "center",
    bold: false,
    italic: false,
    ...overrides,
  };
}

function shape(
  id: string,
  overrides: Partial<ShapeElement> & Pick<ShapeElement, "shape" | "color" | "w" | "h">,
): ShapeElement {
  return { id, type: "shape", x: CX, y: 0.5, rotation: 0, outline: false, ...overrides };
}

function sticker(
  id: string,
  name: StickerName,
  overrides: Partial<StickerElement> = {},
): StickerElement {
  return { id, type: "sticker", sticker: name, x: CX, y: 0.5, w: 0.3, rotation: 0, ...overrides };
}

export type CoverTemplate = {
  /** Stable, and only used as a key and in tests — never stored on a cookbook. */
  id: string;
  /** Said by the picker: "Classic", not "template 1". */
  name: string;
  /** The cloth it is shown in. 1-based. */
  color: number;
  /**
   * Whether the new-cookbook page offers it. That page shows a few covers and
   * a way to design your own — a short row to choose from, not a catalogue —
   * so most templates sit here unshown until there is somewhere to browse
   * them.
   */
  featured?: boolean;
  texture: CoverTexture;
  /** What is placed on the cloth, for a given colour of it. */
  elements: (color: number) => CoverElement[];
};

export const COVER_TEMPLATES: readonly CoverTemplate[] = [
  {
    // The cover every cookbook had before covers could be designed: a fine
    // frame with the name set in the middle of it.
    id: "classic",
    featured: true,
    name: "Classic",
    color: 6,
    texture: "NONE",
    elements: (c) => [
      shape("frame", { shape: "frame", color: inkFor(c), w: 0.816, h: 0.9 }),
      title({ color: inkFor(c), w: 0.7, size: 8.3 }),
    ],
  },
  {
    // A jam-jar label on a tablecloth.
    id: "picnic",
    featured: true,
    name: "Picnic",
    color: 2,
    texture: "GINGHAM",
    elements: (c) => [
      shape("label", { shape: "rect", color: paper(c), w: 0.7, h: 0.34, y: 0.42 }),
      shape("label-rule", { shape: "frame", color: onPaper(c), w: 0.64, h: 0.295, y: 0.42 }),
      title({ color: onPaper(c), y: 0.42, w: 0.56, size: 7.4 }),
    ],
  },
  {
    // A notebook: ruled cloth, the name written large in the corner.
    id: "notebook",
    featured: true,
    name: "Notebook",
    color: 8,
    texture: "GRID",
    elements: (c) => [
      title({ color: inkFor(c), font: "SANS", bold: true, align: "left", x: 0.54, y: 0.26, w: 0.78, size: 10.5 }),
      shape("rule", { shape: "line", color: inkFor(c), w: 0.2, h: 0.012, x: 0.25, y: 0.9 }),
    ],
  },
  {
    // A band across the lower third, the name printed on it.
    id: "band",
    name: "Band",
    color: 7,
    texture: "NONE",
    elements: (c) => [
      shape("band", { shape: "rect", color: paper(c), w: 1.1, h: 0.3, x: 0.5, y: 0.68 }),
      title({ color: onPaper(c), font: "SANS", bold: true, y: 0.68, w: 0.74, size: 8 }),
      sticker("mark", "herb", { y: 0.28, w: 0.3 }),
    ],
  },
  {
    // A round seal with something from the kitchen in it, the name beneath.
    id: "seal",
    featured: true,
    name: "Seal",
    color: 4,
    texture: "NONE",
    elements: (c) => [
      shape("seal", { shape: "circle", color: inkFor(c), outline: true, w: 0.5, h: 0.375, y: 0.34 }),
      sticker("mark", "tomato", { y: 0.34, w: 0.27 }),
      title({ color: inkFor(c), y: 0.72, w: 0.74, size: 8.3 }),
    ],
  },
  {
    // Set like a title page: italic, between two rules.
    id: "title-page",
    name: "Title page",
    color: 1,
    texture: "NONE",
    elements: (c) => [
      shape("rule-top", { shape: "line", color: inkFor(c), w: 0.5, h: 0.012, y: 0.3 }),
      title({ color: inkFor(c), italic: true, y: 0.5, w: 0.72, size: 10 }),
      shape("rule-bottom", { shape: "line", color: inkFor(c), w: 0.5, h: 0.012, y: 0.7 }),
    ],
  },
  {
    // A recipe card: typewriter face, low on the board, under a whisk.
    id: "recipe-card",
    name: "Recipe card",
    color: 3,
    texture: "GRID",
    elements: (c) => [
      sticker("mark", "whisk", { y: 0.3, w: 0.32, rotation: -12 }),
      title({ color: inkFor(c), font: "MONO", y: 0.7, w: 0.76, size: 7 }),
    ],
  },
  {
    // Loud: the name as big as it goes, hard against the bottom left.
    id: "poster",
    name: "Poster",
    color: 5,
    texture: "GINGHAM",
    elements: (c) => [
      shape("block", { shape: "rect", color: paper(c), w: 0.84, h: 0.44, x: 0.53, y: 0.7 }),
      title({ color: onPaper(c), font: "SANS", bold: true, align: "left", x: 0.53, y: 0.7, w: 0.72, size: 10 }),
    ],
  },
];

/** The few covers the new-cookbook page puts in front of someone. */
export const FEATURED_TEMPLATES: readonly CoverTemplate[] = COVER_TEMPLATES.filter(
  (t) => t.featured,
);

/**
 * A template as a cover.
 *
 * Stored as TITLED because every template shows the name — see `styleFor` in
 * cover-editing.ts for what that tells a client that can't draw elements.
 */
export function templateDesign(template: CoverTemplate): CoverDesign {
  return {
    ...DEFAULT_COVER_DESIGN,
    coverColor: template.color,
    coverStyle: "TITLED",
    coverTexture: template.texture,
    coverElements: template.elements(template.color),
  };
}

/** A blank board in a given colour, with only the name on it — where "design your own" starts. */
export function blankDesign(color: number): CoverDesign {
  return {
    ...DEFAULT_COVER_DESIGN,
    coverColor: color,
    coverStyle: "TITLED",
    coverElements: [title({ color: inkFor(color), size: 8.3 })],
  };
}
