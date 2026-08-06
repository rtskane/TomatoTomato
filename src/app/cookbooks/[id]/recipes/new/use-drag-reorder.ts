"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Drag-to-reorder built on Pointer Events.
 *
 * Deliberately NOT the HTML5 drag-and-drop API: `dragstart` never fires on
 * touch devices, so that route would silently ship a desktop-only feature.
 * Pointer events cover mouse, touch and stylus in one path.
 *
 * The caller must also expose non-drag controls (the up/down buttons) — drag
 * alone is unreachable by keyboard, and `moveItem` is shared between them so
 * the ordering rules stay identical.
 */
export function useDragReorder(onMove: (from: number, to: number) => void) {
  const listRef = useRef<HTMLElement | null>(null);
  const fromIndex = useRef<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // Which row is the pointer currently over? Measured from live layout rather
  // than tracked deltas, so it stays correct even with rows of varying height
  // (steps wrap to different numbers of lines).
  const indexAtPoint = useCallback((clientY: number): number | null => {
    const list = listRef.current;
    if (!list) return null;

    const rows = Array.from(list.children) as HTMLElement[];
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return rows.length - 1;
  }, []);

  const onPointerDown = useCallback(
    (index: number) => (event: React.PointerEvent) => {
      // Ignore secondary buttons; let right-click behave normally.
      if (event.button !== 0) return;
      event.preventDefault();
      (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
      fromIndex.current = index;
      setDraggingIndex(index);
      setOverIndex(index);
    },
    [],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (fromIndex.current === null) return;
      const target = indexAtPoint(event.clientY);
      if (target !== null) setOverIndex(target);
    },
    [indexAtPoint],
  );

  const finish = useCallback(() => {
    const from = fromIndex.current;
    if (from !== null && overIndex !== null && from !== overIndex) {
      onMove(from, overIndex);
    }
    fromIndex.current = null;
    setDraggingIndex(null);
    setOverIndex(null);
  }, [onMove, overIndex]);

  // A callback ref rather than an exposed ref object: the caller spreads
  // `listProps` instead of reading `.current` during render, which is both the
  // rule React enforces and one less thing for the caller to wire up.
  const setListRef = useCallback((element: HTMLElement | null) => {
    listRef.current = element;
  }, []);

  return {
    draggingIndex,
    overIndex,
    /** Spread onto the drag handle. */
    handleProps: (index: number) => ({
      onPointerDown: onPointerDown(index),
      // Stop the browser from scrolling/selecting while a drag is in progress.
      // Scoped to the handle so the rest of the page still scrolls on touch.
      style: { touchAction: "none" as const, cursor: "grab" },
    }),
    /** Spread onto the list element that contains the rows. */
    listProps: {
      ref: setListRef,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
    },
  };
}
