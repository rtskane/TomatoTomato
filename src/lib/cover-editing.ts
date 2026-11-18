import {
  canAdd,
  inkFor,
  MAX_EXTENT,
  MAX_TEXT_SIZE,
  MIN_EXTENT,
  MIN_TEXT_SIZE,
  type CoverElement,
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

export function newElementId(): string {
  return Math.random().toString(36).slice(2, 10);
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
  return {
    id: newElementId(),
    type: "text",
    ...landing(elements),
    w: 0.6,
    rotation: 0,
    text: "Your text",
    font: "SERIF",
    size: 8,
    color: inkFor(coverColor),
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
};

export function createShape(
  elements: readonly CoverElement[],
  shape: ShapeKind,
  coverColor: number,
): ShapeElement | null {
  if (!canAdd(elements, "shape")) return null;
  return {
    id: newElementId(),
    type: "shape",
    ...landing(elements),
    ...SHAPE_DEFAULTS[shape],
    rotation: 0,
    shape,
    color: inkFor(coverColor),
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
  const dims = [start.w];
  if ("h" in start) dims.push(start.h);
  let lo = Math.max(...dims.map((d) => MIN_EXTENT / d));
  let hi = Math.min(...dims.map((d) => MAX_EXTENT / d));
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
    return "h" in start ? { ...start, h: clampExtent(extent) } : start;
  }
  return { ...start, w: clampExtent(extent) };
}

/** Settle an angle onto the nearest 45° when it is close to one. */
export function snapAngle(degrees: number): number {
  const folded = ((((degrees + 180) % 360) + 360) % 360) - 180;
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
