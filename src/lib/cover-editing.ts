import type { CoverDesign, CoverStyle, CoverTitleSize } from "@/lib/book-covers";
import {
  BOARD_CENTRE_X,
  FRAME_LINE,
  OUTLINE_LINE,
  canAdd,
  foldAngle,
  hasOutline,
  inkFor,
  isTitle,
  titleElement,
  MAX_EXTENT,
  MAX_TEXT_SIZE,
  MIN_EXTENT,
  MIN_TEXT_SIZE,
  MIN_THICKNESS,
  type CoverElement,
  type ElementColor,
  type PhotoElement,
  type ShapeElement,
  type ShapeKind,
  type StickerElement,
  type StickerName,
  type TextElement,
} from "@/lib/cover-elements";

// The arithmetic behind the cover editor's gestures, and the edits its
// buttons make — pure functions over the element list, so the rules can be
// tested without a pointer in sight. The component turns pointer positions
// into the numbers these take; these decide what happens to the cover.

/** A cover is 3:4, so a fraction of its width is ¾ that fraction of its height. */
export const BOARD_ASPECT = 3 / 4;

/** How close to the middle a drag has to come before it snaps there. */
export const SNAP = 0.02;

/** Angles a rotation settles on when it comes within `ANGLE_SNAP` of them. */
const SNAP_ANGLES = [-180, -135, -90, -45, 0, 45, 90, 135, 180];
const ANGLE_SNAP = 4;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const clampExtent = (v: number) => clamp(v, MIN_EXTENT, MAX_EXTENT);

/** The least height an element can have: a shape may be a thin rule, a photo may not. */
function minHeight(element: CoverElement): number {
  return element.type === "shape" ? MIN_THICKNESS : MIN_EXTENT;
}

export function newElementId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** The ink that reads on a given element colour. */
function inkOn(color: ElementColor): ElementColor {
  if (color === "white") return "cover-1";
  return inkFor(Number(color.slice("cover-".length)));
}

/**
 * The colour something new should start in at a point on the cover: the ink
 * of whatever it will be sitting on.
 *
 * Usually that is the cloth. But a cover often has a label or a band on it,
 * and a new text box lands in the middle — on the label. Started in the
 * cloth's ink it would be white on white, and look like nothing was added.
 * So the topmost filled shape under the point decides instead.
 *
 * Rotation is ignored: this picks a starting colour, and a near miss on a
 * tilted label only means the owner changes it themselves.
 */
export function inkAt(
  elements: readonly CoverElement[],
  coverColor: number,
  x: number,
  y: number,
): ElementColor {
  for (let i = elements.length - 1; i >= 0; i--) {
    const e = elements[i];
    if (e.type !== "shape" || e.shape === "line" || isHollow(e)) continue;
    if (Math.abs(x - e.x) <= e.w / 2 && Math.abs(y - e.y) <= e.h / 2) return inkOn(e.color);
  }
  return inkFor(coverColor);
}

/** A shape that is only a line round nothing: a frame, or an outlined rectangle or circle. */
export function isHollow(element: CoverElement): boolean {
  return (
    element.type === "shape" &&
    (element.shape === "frame" || (element.outline && hasOutline(element.shape)))
  );
}

/**
 * Whether a press lands on a hollow shape's *line* rather than in the empty
 * middle of it.
 *
 * A frame can be nearly the size of the cover. If its whole box caught the
 * pointer, nothing underneath it could ever be picked up again — so only the
 * line itself (and a few pixels either side, for a finger) counts.
 *
 * `offsetX`/`offsetY` are the press's offset from the shape's centre in
 * screen pixels; `board` is the cover's size on screen. A turned shape is
 * handled here — the press is turned back into the shape's own axes first —
 * so the caller only has to say where the pointer is.
 */
export function onOutline(
  element: ShapeElement,
  offsetX: number,
  offsetY: number,
  board: { width: number; height: number },
  slack = 8,
): boolean {
  const halfW = (element.w * board.width) / 2;
  const halfH = (element.h * board.height) / 2;
  // Nothing has been laid out (a test environment): there is no middle to miss.
  if (!(halfW > 0 && halfH > 0)) return true;

  const angle = (-element.rotation * Math.PI) / 180;
  const dx = offsetX * Math.cos(angle) - offsetY * Math.sin(angle);
  const dy = offsetX * Math.sin(angle) + offsetY * Math.cos(angle);

  // The line's own thickness, as BookCover draws it.
  const line = (element.shape === "frame" ? FRAME_LINE : OUTLINE_LINE) * board.width;
  const reach = line + slack;

  if (element.shape === "circle") {
    // 1 on the edge of the ellipse; measured against its smaller radius.
    const r = Math.hypot(dx / halfW, dy / halfH);
    const scale = Math.min(halfW, halfH);
    return r <= 1 + slack / scale && r >= 1 - reach / scale;
  }

  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax > halfW + slack || ay > halfH + slack) return false;
  return ax >= halfW - reach || ay >= halfH - reach;
}

/**
 * Where a new element lands: the middle, stepped down a little for each thing
 * already on the cover, so adding three stickers in a row gives three
 * stickers rather than one with two hidden under it.
 */
function landing(elements: readonly CoverElement[]) {
  const step = (elements.length % 5) * 0.04;
  return { x: 0.5 + step / 2, y: 0.45 + step };
}

export function createText(
  elements: readonly CoverElement[],
  coverColor: number,
): TextElement | null {
  if (!canAdd(elements, "text")) return null;
  const at = landing(elements);
  return {
    id: newElementId(),
    type: "text",
    ...at,
    w: 0.6,
    rotation: 0,
    text: "Your text",
    font: "SERIF",
    size: 8,
    color: inkAt(elements, coverColor, at.x, at.y),
    align: "center",
    bold: false,
    italic: false,
  };
}

/**
 * The cookbook's name, as a text box. Its `text` stays empty: what it draws
 * is the name itself (see `TextElement.role`). Null when the cover already
 * shows its title — there is one name, so there is one of these.
 */
export function createTitle(
  elements: readonly CoverElement[],
  coverColor: number,
): TextElement | null {
  if (titleElement(elements) || !canAdd(elements, "text")) return null;
  return {
    id: newElementId(),
    type: "text",
    role: "title",
    x: BOARD_CENTRE_X,
    y: 0.5,
    w: 0.7,
    rotation: 0,
    text: "",
    font: "SERIF",
    size: 8.3,
    color: inkAt(elements, coverColor, BOARD_CENTRE_X, 0.5),
    align: "center",
    bold: false,
    italic: false,
  };
}

/**
 * New shapes start in a size that reads as the shape: a circle has to be
 * taller as a fraction than it is wide, because the board is.
 */
const SHAPE_DEFAULTS: Record<ShapeKind, { w: number; h: number }> = {
  rect: { w: 0.5, h: 0.2 },
  circle: { w: 0.4, h: 0.4 * BOARD_ASPECT },
  triangle: { w: 0.4, h: 0.4 * BOARD_ASPECT },
  line: { w: 0.7, h: 0.012 },
  frame: { w: 0.8, h: 0.88 },
};

export function createShape(
  elements: readonly CoverElement[],
  shape: ShapeKind,
  coverColor: number,
): ShapeElement | null {
  if (!canAdd(elements, "shape")) return null;
  const at = landing(elements);
  return {
    id: newElementId(),
    type: "shape",
    ...at,
    ...SHAPE_DEFAULTS[shape],
    rotation: 0,
    shape,
    color: inkAt(elements, coverColor, at.x, at.y),
    outline: false,
  };
}

export function createSticker(
  elements: readonly CoverElement[],
  sticker: StickerName,
): StickerElement | null {
  if (!canAdd(elements, "sticker")) return null;
  return {
    id: newElementId(),
    type: "sticker",
    ...landing(elements),
    w: 0.28,
    rotation: 0,
    sticker,
  };
}

/**
 * A photo keeps its own proportions when it arrives: `ratio` is the image's
 * height over its width, and the box is sized so nothing is cropped until the
 * owner chooses to crop it.
 */
export function createPhoto(
  elements: readonly CoverElement[],
  url: string,
  ratio: number,
): PhotoElement | null {
  if (!canAdd(elements, "photo")) return null;
  const w = 0.5;
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  return {
    id: newElementId(),
    type: "photo",
    ...landing(elements),
    w,
    h: clampExtent(w * BOARD_ASPECT * safeRatio),
    rotation: 0,
    url,
    mask: "rounded",
  };
}

// ---------------------------------------------------------------------------
// Gestures
// ---------------------------------------------------------------------------

/**
 * Snap one axis of a centre to the middle of the board when it comes close.
 * Returns whether it snapped, so the editor can draw the guide.
 */
export function snapToMiddle(value: number): { value: number; snapped: boolean } {
  return Math.abs(value - 0.5) < SNAP
    ? { value: 0.5, snapped: true }
    : { value: clamp(value, 0, 1), snapped: false };
}

/**
 * Grow or shrink an element about its centre by `factor`, keeping its
 * proportions. Text grows its type with its box — that is what dragging a
 * corner of a text box means in every design tool.
 *
 * The factor is limited so that *no* dimension crosses its bounds, rather than
 * clamping each one separately, which would quietly change the proportions at
 * the edges.
 */
export function scaleElement<T extends CoverElement>(start: T, factor: number): T {
  const dims = [{ value: start.w, min: MIN_EXTENT }];
  if ("h" in start) dims.push({ value: start.h, min: minHeight(start) });
  let lo = Math.max(...dims.map((d) => d.min / d.value));
  let hi = Math.min(...dims.map((d) => MAX_EXTENT / d.value));
  if (start.type === "text") {
    lo = Math.max(lo, MIN_TEXT_SIZE / start.size);
    hi = Math.min(hi, MAX_TEXT_SIZE / start.size);
  }
  const f = clamp(Number.isFinite(factor) ? factor : 1, lo, hi);

  const next = { ...start, w: start.w * f };
  if ("h" in start && "h" in next) next.h = start.h * f;
  if (start.type === "text" && next.type === "text") {
    next.size = Math.round(start.size * f * 10) / 10;
  }
  return next;
}

/** Stretch one dimension only — the side handles. Stickers stay square. */
export function stretchElement<T extends CoverElement>(
  start: T,
  axis: "w" | "h",
  extent: number,
): T {
  if (axis === "h") {
    return "h" in start ? { ...start, h: clamp(extent, minHeight(start), MAX_EXTENT) } : start;
  }
  return { ...start, w: clampExtent(extent) };
}

/** Settle an angle onto the nearest 45° when it is close to one. */
export function snapAngle(degrees: number): number {
  const folded = foldAngle(degrees);
  const near = SNAP_ANGLES.find((a) => Math.abs(a - folded) <= ANGLE_SNAP);
  const result = near ?? Math.round(folded);
  return result === -180 ? 180 : result;
}

// ---------------------------------------------------------------------------
// Edits
// ---------------------------------------------------------------------------

export function updateElement(
  elements: readonly CoverElement[],
  id: string,
  patch: Partial<CoverElement>,
): CoverElement[] {
  return elements.map((e) => (e.id === id ? ({ ...e, ...patch } as CoverElement) : e));
}

export function removeElement(elements: readonly CoverElement[], id: string): CoverElement[] {
  return elements.filter((e) => e.id !== id);
}

/**
 * Move an element one step up or down the stack. The list order *is* the
 * stacking order, so this is a swap with a neighbour.
 */
export function restack(
  elements: readonly CoverElement[],
  id: string,
  direction: "forward" | "backward",
): CoverElement[] {
  const index = elements.findIndex((e) => e.id === id);
  const target = direction === "forward" ? index + 1 : index - 1;
  if (index === -1 || target < 0 || target >= elements.length) return [...elements];
  const next = [...elements];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * A copy, nudged down and right so it is visibly a second one, placed directly
 * above the original. Null when that type is at its limit.
 */
export function duplicateElement(
  elements: readonly CoverElement[],
  id: string,
): { elements: CoverElement[]; copy: CoverElement } | null {
  const index = elements.findIndex((e) => e.id === id);
  const original = elements[index];
  if (!original || !canAdd(elements, original.type)) return null;
  // There is one cookbook name, so there is no second copy of it to make.
  if (isTitle(original)) return null;
  const copy = {
    ...original,
    id: newElementId(),
    x: clamp(original.x + 0.04, 0, 1),
    y: clamp(original.y + 0.04, 0, 1),
  };
  const next = [...elements];
  next.splice(index + 1, 0, copy);
  return { elements: next, copy };
}

// ---------------------------------------------------------------------------
// Opening an older cover
// ---------------------------------------------------------------------------

/** The plate's three type sizes, as the `cqw` a text element is measured in. */
const PLATE_SIZES: Record<CoverTitleSize, number> = { SMALL: 6.2, MEDIUM: 8.3, LARGE: 11 };

/**
 * A cover as the editor works on it: the title is always an element.
 *
 * Covers designed before the title could be moved keep it on a fixed plate —
 * a frame with the name inside, set from three radio groups. This rebuilds
 * that plate out of ordinary elements, in the same place and the same type,
 * so opening an old cover in the editor shows the cover it was and every part
 * of it can now be picked up. Nothing is written until the owner saves.
 *
 * Only a TITLED cover has a plate. A plain or photo cover never showed its
 * title, so it gets none here either; the editor offers to add one.
 */
export function asFreeform(design: CoverDesign): CoverDesign {
  // A picture that was uploaded but isn't the chosen style isn't on the cover.
  // The editor has no hidden picture to come back to, so it is let go here
  // and the save cleans the file up.
  if (design.coverStyle !== "PHOTO" && design.coverImageUrl) {
    design = { ...design, coverImageUrl: null, coverFocalX: 0.5, coverFocalY: 0.5, coverZoom: 1 };
  }

  const showsPlate =
    design.coverStyle === "TITLED" && !titleElement(design.coverElements);
  if (!showsPlate) return design;

  const ink = inkFor(design.coverColor);
  // The plate's box, from BookCover: inset 6.7cqw top, bottom and right, and
  // 11.7cqw on the left to clear the spine — on a board 133.3cqw tall.
  const frame: ShapeElement = {
    id: "plate-frame",
    type: "shape",
    shape: "frame",
    x: BOARD_CENTRE_X,
    y: 0.5,
    w: 0.816,
    h: 0.9,
    rotation: 0,
    color: ink,
    outline: true,
  };
  const title: TextElement = {
    id: "plate-title",
    type: "text",
    role: "title",
    x: BOARD_CENTRE_X,
    y: { TOP: 0.2, CENTER: 0.5, BOTTOM: 0.8 }[design.coverTitlePosition] ?? 0.5,
    w: 0.74,
    rotation: 0,
    text: "",
    font: design.coverTitleFont === "SANS" ? "SANS" : "SERIF",
    size: PLATE_SIZES[design.coverTitleSize] ?? PLATE_SIZES.MEDIUM,
    color: ink,
    align: "center",
    bold: false,
    italic: false,
  };

  // Underneath whatever was already placed, which is where the plate was.
  return { ...design, coverElements: [frame, title, ...design.coverElements] };
}

/**
 * The style a freeform cover is stored under.
 *
 * The editor has no "style" control — a cover is a background with things on
 * it — but the column still means something to anything that can't draw
 * elements (the phone app, for now): PHOTO says the picture fills the board,
 * TITLED says "show the title", PLAIN says "don't". So a cover with its title
 * placed is TITLED, and those clients fall back to the old plate rather than
 * drawing a book with no name on it.
 */
export function styleFor(design: Pick<CoverDesign, "coverImageUrl" | "coverElements">): CoverStyle {
  if (design.coverImageUrl) return "PHOTO";
  return titleElement(design.coverElements) ? "TITLED" : "PLAIN";
}

/**
 * Carry the elements over to a different cloth.
 *
 * Most of what sits on a cover is either the cloth's ink or its opposite — a
 * white name on a dark cloth, a dark label behind white type. Move that to a
 * pale cloth unchanged and the name vanishes into it. So when the new cloth
 * takes the other ink, white and the dark neutral trade places everywhere:
 * what read against the old cloth reads against the new one, and anything
 * printed on a label still reads on the label.
 *
 * Every other colour is a choice someone made, and is left alone.
 */
export function reink(
  elements: readonly CoverElement[],
  fromColor: number,
  toColor: number,
): CoverElement[] {
  if (inkFor(fromColor) === inkFor(toColor)) return [...elements];
  return elements.map((e) => {
    if (e.type !== "text" && e.type !== "shape") return e;
    if (e.color === "white") return { ...e, color: "cover-1" };
    if (e.color === "cover-1") return { ...e, color: "white" };
    return e;
  });
}
