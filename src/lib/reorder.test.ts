import { describe, it, expect } from "vitest";
import { moveItem } from "./reorder";

const list = ["a", "b", "c", "d"];

describe("moveItem", () => {
  it("moves an item down", () => {
    expect(moveItem(list, 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an item up", () => {
    expect(moveItem(list, 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("moves by one, the way the arrow buttons do", () => {
    expect(moveItem(list, 1, 0)).toEqual(["b", "a", "c", "d"]);
    expect(moveItem(list, 1, 2)).toEqual(["a", "c", "b", "d"]);
  });

  it("moves to the end", () => {
    expect(moveItem(list, 0, 3)).toEqual(["b", "c", "d", "a"]);
  });

  it("is a no-op when the indices match", () => {
    expect(moveItem(list, 2, 2)).toEqual(list);
  });

  // The up button on row 0 and the down button on the last row.
  it("is a no-op for out-of-range targets", () => {
    expect(moveItem(list, 0, -1)).toEqual(list);
    expect(moveItem(list, 3, 4)).toEqual(list);
  });

  it("is a no-op for an out-of-range source", () => {
    expect(moveItem(list, 9, 0)).toEqual(list);
    expect(moveItem(list, -1, 0)).toEqual(list);
  });

  it("never mutates the input", () => {
    const original = [...list];
    moveItem(list, 0, 3);
    expect(list).toEqual(original);
  });

  it("handles a single-item list", () => {
    expect(moveItem(["only"], 0, 0)).toEqual(["only"]);
  });

  it("handles an empty list", () => {
    expect(moveItem([], 0, 1)).toEqual([]);
  });
});
