"use client";

import { useLayoutEffect, useRef, useState, type Ref } from "react";
import BookCover from "@/components/book-cover";
import { clampFraction, type CoverDesign } from "@/lib/book-covers";
import type { CoverElement } from "@/lib/cover-elements";
import {
  isHollow,
  onOutline,
  scaleElement,
  snapAngle,
  snapToMiddle,
  stretchElement,
  updateElement,
} from "@/lib/cover-editing";

/**
 * The cover as something you can grab: press an element to select and drag
 * it, pull a corner to resize it, the knob above it to turn it.
 *
 * The book underneath is `BookCover` — the shelf's own component — so the
 * editor never draws a second picture of the cover that could disagree with
 * the first. The selection frame and its handles live *outside* the board,
 * in a layer over it, because the board clips its contents and a handle on an
 * element near the edge would otherwise be cut in half.
 *
 * ## Live and committed
 *
 * A drag changes the cover on every pointer move, but only the finished drag
 * is one step of undo. So gestures report twice: `onLiveChange` as they go,
 * `onCommit` once they end. The editor decides what counts as a change worth
 * remembering.
 */

const NUDGE = 0.01;
const BIG_NUDGE = 0.05;
const PHOTO_NUDGE = 0.02;
/** Keyboard resize: + and − grow and shrink by a tenth. */
const SCALE_KEYS: Record<string, number> = { "+": 1.1, "=": 1.1, "-": 1 / 1.1 };
/** Keyboard turn: [ and ] rotate by this many degrees. */
const TURN = 15;

type Corner = "nw" | "ne" | "se" | "sw";
type Side = "e" | "s";

const CORNER_POSITIONS: Record<Corner, { left: string; top: string; cursor: string }> = {
  nw: { left: "0%", top: "0%", cursor: "cursor-nwse-resize" },
  ne: { left: "100%", top: "0%", cursor: "cursor-nesw-resize" },
  se: { left: "100%", top: "100%", cursor: "cursor-nwse-resize" },
  sw: { left: "0%", top: "100%", cursor: "cursor-nesw-resize" },
};

const SIDE_POSITIONS: Record<Side, { left: string; top: string; cursor: string }> = {
  e: { left: "100%", top: "50%", cursor: "cursor-ew-resize" },
  s: { left: "50%", top: "100%", cursor: "cursor-ns-resize" },
};

const KIND_NAMES: Record<CoverElement["type"], string> = {
  text: "Text",
  photo: "Photo",
  shape: "Shape",
  sticker: "Sticker",
};

/**
 * Follow a pointer until it lets go. On `window` rather than the element, so
 * a fast drag that leaves the cover keeps tracking instead of stopping dead at
 * its edge.
 */
function track(onMove: (e: PointerEvent) => void, onEnd: () => void) {
  const up = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    onEnd();
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
}

export default function CoverCanvas({
  title,
  design,
  selectedId,
  onSelect,
  onLiveChange,
  onCommit,
  onDelete,
  onEditText,
  onReframe,
  boardRef,
  className = "",
  describedBy,
}: {
  title: string;
  design: CoverDesign;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onLiveChange: (elements: CoverElement[]) => void;
  /** A gesture finished — whether or not it changed anything. */
  onCommit: () => void;
  onDelete: (id: string) => void;
  /** A double-click on a text box: go and edit its words. */
  onEditText: (id: string) => void;
  /** Move the background photograph by a fraction of the board. */
  onReframe: (dx: number, dy: number) => void;
  boardRef?: Ref<HTMLDivElement>;
  className?: string;
  describedBy?: string;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null);
  const [guides, setGuides] = useState({ x: false, y: false });

  const elements = design.coverElements;
  const selected = elements.find((e) => e.id === selectedId) ?? null;
  const isPhoto = design.coverStyle === "PHOTO" && Boolean(design.coverImageUrl);

  // The frame takes its size from the element as actually laid out, not from
  // its stored numbers: a text box's height is whatever its words wrap to, and
  // nothing stores that. A ResizeObserver catches every way that changes —
  // typing, a font arriving, the cover itself resizing.
  useLayoutEffect(() => {
    const node = selectedId
      ? stageRef.current?.querySelector<HTMLElement>(`[data-element-id="${selectedId}"]`)
      : null;
    if (!node) {
      setFrame(null);
      return;
    }
    const measure = () => setFrame({ w: node.offsetWidth, h: node.offsetHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [selectedId]);

  function board() {
    return stageRef.current?.getBoundingClientRect() ?? null;
  }

  /** The element's centre, in the viewport's pixels. */
  function centreOf(element: CoverElement, rect: DOMRect) {
    return {
      x: rect.left + element.x * rect.width,
      y: rect.top + element.y * rect.height,
    };
  }

  // ---- Pressing the cover ------------------------------------------------

  /**
   * Which element a press is on: the topmost one under the pointer, looking
   * *through* the empty middle of a frame or an outlined shape to whatever is
   * beneath it. Without that, a frame the size of the cover would shield
   * everything under it from ever being picked up.
   */
  function elementAt(clientX: number, clientY: number, target: EventTarget): CoverElement | null {
    const rect = board();
    // jsdom has no hit-testing; there the event's own target is the answer.
    const under =
      typeof document.elementsFromPoint === "function"
        ? document.elementsFromPoint(clientX, clientY)
        : [target as Element];

    const seen = new Set<string>();
    for (const node of under) {
      const hit = node.closest<HTMLElement>("[data-element-id]");
      const id = hit?.dataset.elementId;
      if (!hit || !id || seen.has(id) || !stageRef.current?.contains(hit)) continue;
      seen.add(id);

      const element = elements.find((e) => e.id === id);
      if (!element) continue;

      if (rect && element.type === "shape" && isHollow(element)) {
        const c = centreOf(element, rect);
        if (!onOutline(element, clientX - c.x, clientY - c.y, rect)) continue;
      }
      return element;
    }
    return null;
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const rect = board();
    if (!rect) return;

    const element = elementAt(event.clientX, event.clientY, event.target);

    if (element) {
      // No text selection or native image drag mid-gesture — but that also
      // skips the focus a press would give, and the keys (Delete, arrows)
      // should work on what was just pressed, so focus is given back by hand.
      event.preventDefault();
      event.currentTarget.focus({ preventScroll: true });
      onSelect(element.id);
      startMove(event, element, rect);
      return;
    }

    // Empty board: let go of whatever was selected, and if the background is
    // a photograph, the press frames it — as it always has.
    onSelect(null);
    if (isPhoto) startReframe(event, rect);
  }

  function startMove(event: React.PointerEvent, element: CoverElement, rect: DOMRect) {
    const before = elements;
    const startX = event.clientX;
    const startY = event.clientY;

    track(
      (e) => {
        const x = snapToMiddle(element.x + (e.clientX - startX) / rect.width);
        const y = snapToMiddle(element.y + (e.clientY - startY) / rect.height);
        setGuides({ x: x.snapped, y: y.snapped });
        onLiveChange(updateElement(before, element.id, { x: x.value, y: y.value }));
      },
      () => {
        setGuides({ x: false, y: false });
        onCommit();
      },
    );
  }

  function startReframe(event: React.PointerEvent, rect: DOMRect) {
    let lastX = event.clientX;
    let lastY = event.clientY;
    track(
      (e) => {
        // Inverted: `objectPosition` names the point of the picture pinned to
        // the frame, so dragging the picture right reveals more of its left.
        onReframe(-(e.clientX - lastX) / rect.width, -(e.clientY - lastY) / rect.height);
        lastX = e.clientX;
        lastY = e.clientY;
      },
      () => {},
    );
  }

  // ---- The handles ------------------------------------------------------

  function startScale(event: React.PointerEvent) {
    event.stopPropagation();
    event.preventDefault();
    const rect = board();
    if (!selected || !rect) return;
    const before = elements;
    const start = selected;
    const c = centreOf(start, rect);
    const startDistance = Math.hypot(event.clientX - c.x, event.clientY - c.y) || 1;

    track(
      (e) => {
        const factor = Math.hypot(e.clientX - c.x, e.clientY - c.y) / startDistance;
        onLiveChange(updateElement(before, start.id, scaleElement(start, factor)));
      },
      onCommit,
    );
  }

  function startStretch(event: React.PointerEvent) {
    // Read off the handle rather than closed over per handle, which the React
    // Compiler's lint mistakes for reading a ref during render.
    const side = (event.currentTarget as HTMLElement).dataset.side as Side;
    event.stopPropagation();
    event.preventDefault();
    const rect = board();
    if (!selected || !rect) return;
    const before = elements;
    const start = selected;
    const c = centreOf(start, rect);
    const angle = (start.rotation * Math.PI) / 180;
    // The element's own axes, turned with it: stretching a tilted box should
    // follow the box, not the screen.
    const axis =
      side === "e"
        ? { x: Math.cos(angle), y: Math.sin(angle), size: rect.width, key: "w" as const }
        : { x: -Math.sin(angle), y: Math.cos(angle), size: rect.height, key: "h" as const };

    track(
      (e) => {
        const along = (e.clientX - c.x) * axis.x + (e.clientY - c.y) * axis.y;
        const extent = (2 * Math.abs(along)) / axis.size;
        onLiveChange(updateElement(before, start.id, stretchElement(start, axis.key, extent)));
      },
      onCommit,
    );
  }

  function startRotate(event: React.PointerEvent) {
    event.stopPropagation();
    event.preventDefault();
    const rect = board();
    if (!selected || !rect) return;
    const before = elements;
    const start = selected;
    const c = centreOf(start, rect);

    track(
      (e) => {
        // +90 because the knob sits above the element: pointing straight up
        // is "not turned at all".
        const degrees = (Math.atan2(e.clientY - c.y, e.clientX - c.x) * 180) / Math.PI + 90;
        onLiveChange(updateElement(before, start.id, { rotation: snapAngle(degrees) }));
      },
      onCommit,
    );
  }

  // ---- Keyboard ---------------------------------------------------------

  // Everything a pointer can do to a selected element has a key, and the
  // background photograph keeps its arrow-key framing when nothing is
  // selected. A design tool reachable only by mouse is one some people simply
  // do not have.
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const arrow = arrows[event.key];

    if (selected) {
      if (arrow) {
        event.preventDefault();
        const step = event.shiftKey ? BIG_NUDGE : NUDGE;
        onLiveChange(
          updateElement(elements, selected.id, {
            x: clampFraction(selected.x + arrow[0] * step),
            y: clampFraction(selected.y + arrow[1] * step),
          }),
        );
        onCommit();
      } else if (SCALE_KEYS[event.key]) {
        event.preventDefault();
        onLiveChange(
          updateElement(elements, selected.id, scaleElement(selected, SCALE_KEYS[event.key])),
        );
        onCommit();
      } else if (event.key === "[" || event.key === "]") {
        event.preventDefault();
        const turn = event.key === "]" ? TURN : -TURN;
        onLiveChange(
          updateElement(elements, selected.id, {
            rotation: snapAngle(selected.rotation + turn),
          }),
        );
        onCommit();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        onDelete(selected.id);
      } else if (event.key === "Escape") {
        // Only swallowed when it did something, so Escape still closes a
        // dialog the editor sits in once nothing is selected.
        event.preventDefault();
        event.stopPropagation();
        onSelect(null);
      }
      return;
    }

    if (isPhoto && arrow) {
      event.preventDefault();
      onReframe(arrow[0] * PHOTO_NUDGE, arrow[1] * PHOTO_NUDGE);
    }
  }

  const across = Math.round(design.coverFocalX * 100);
  const down = Math.round(design.coverFocalY * 100);
  const focusable = Boolean(selected) || isPhoto;

  return (
    <div ref={stageRef} className={`relative ${className}`}>
      <div
        ref={boardRef}
        // A focus stop only when there is something for the keys to move: a
        // selected element, or a photograph to frame.
        role={focusable ? "group" : undefined}
        aria-label={
          selected
            ? `${KIND_NAMES[selected.type]} selected. Arrow keys move it, plus and minus resize it, square brackets turn it, Delete removes it, Escape lets go.`
            : isPhoto
              ? `Photo position: ${across}% across, ${down}% down. Use the arrow keys to reframe.`
              : undefined
        }
        aria-describedby={focusable ? describedBy : undefined}
        // -1 rather than nothing when there is nothing to move, so a press
        // can still focus it programmatically without adding a tab stop.
        tabIndex={focusable ? 0 : -1}
        onPointerDown={handlePointerDown}
        onDoubleClick={(event) => {
          const element = elementAt(event.clientX, event.clientY, event.target);
          if (element?.type === "text") onEditText(element.id);
        }}
        onKeyDown={handleKeyDown}
        className={`rounded-md outline-none select-none focus-visible:ring-2 focus-visible:ring-border-input-strong focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_[data-element-id]]:cursor-move [&_[data-element-id]]:touch-none ${
          isPhoto ? "cursor-grab touch-none active:cursor-grabbing" : ""
        }`}
      >
        <BookCover
          title={title.trim() || "Untitled cookbook"}
          design={design}
          sizes="(min-width: 768px) 448px, 80vw"
          className="aspect-3/4 w-full shadow-md"
        />
      </div>

      {/* Centre guides, shown while a drag is snapped to the middle. */}
      {guides.x ? (
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-accent" />
      ) : null}
      {guides.y ? (
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-accent" />
      ) : null}

      {selected && frame ? (
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            left: `${selected.x * 100}%`,
            top: `${selected.y * 100}%`,
            width: frame.w,
            height: frame.h,
            transform: `translate(-50%, -50%) rotate(${selected.rotation}deg)`,
          }}
        >
          <span className="absolute -inset-px rounded-xs ring-2 ring-accent" />

          {/* The rotate knob, on a short stalk above the top edge. */}
          <span className="absolute bottom-full left-1/2 h-5 w-px -translate-x-1/2 bg-accent" />
          <Handle
            left="50%"
            top="-1.25rem"
            className="cursor-grab"
            onPointerDown={startRotate}
            round
          />

          {(Object.keys(CORNER_POSITIONS) as Corner[]).map((corner) => (
            <Handle
              key={corner}
              {...CORNER_POSITIONS[corner]}
              className={CORNER_POSITIONS[corner].cursor}
              onPointerDown={startScale}
            />
          ))}

          {/* Sides stretch one way only. A sticker is drawn square, so it
              has none; text wraps, so it only has the width. */}
          {selected.type !== "sticker"
            ? (Object.keys(SIDE_POSITIONS) as Side[])
                .filter((side) => side === "e" || selected.type !== "text")
                .map((side) => (
                  <Handle
                    key={side}
                    {...SIDE_POSITIONS[side]}
                    className={SIDE_POSITIONS[side].cursor}
                    onPointerDown={startStretch}
                    bar={side}
                  />
                ))
            : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * One grab point. Drawn small, but with a hit area well past its edge — a
 * 12px dot is fine to look at and hopeless to land a thumb on.
 */
function Handle({
  left,
  top,
  className,
  onPointerDown,
  round = false,
  bar,
}: {
  left: string;
  top: string;
  className: string;
  onPointerDown: (event: React.PointerEvent) => void;
  round?: boolean;
  bar?: Side;
}) {
  const shape = bar === "e" ? "h-4 w-1.5" : bar === "s" ? "h-1.5 w-4" : "size-3";
  return (
    <span
      onPointerDown={onPointerDown}
      data-side={bar}
      className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 touch-none border-2 border-accent bg-background shadow-sm before:absolute before:-inset-3 before:content-[''] ${
        round ? "rounded-full" : "rounded-xs"
      } ${shape} ${className}`}
      style={{ left, top }}
    />
  );
}
