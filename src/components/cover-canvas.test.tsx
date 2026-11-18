// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CoverEditor, { type CoverEditorResult } from "./cover-editor";
import { coverDesign } from "./book-cover";
import { titleElement, type CoverElement, type ShapeElement } from "@/lib/cover-elements";
import { blankDesign } from "@/lib/cover-templates";

vi.mock("@vercel/blob/client", () => ({ upload: vi.fn() }));

// The canvas's pointer gestures, driven through the editor so what is asserted
// is the cover that comes out. jsdom does no layout, so the board is given a
// size here: 300 × 400 at the top-left of the screen, which makes a pixel a
// round fraction of the cover (30px across is 0.1; 40px down is 0.1).
const BOARD = { left: 0, top: 0, width: 300, height: 400, right: 300, bottom: 400, x: 0, y: 0 };
const BLOB = "https://abc123.public.blob.vercel-storage.com/cookbook-covers/a.jpg";

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    ...BOARD,
    toJSON: () => BOARD,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  // Only some tests install it; jsdom has none of its own.
  delete (document as { elementsFromPoint?: unknown }).elementsFromPoint;
});

function renderEditor(design = blankDesign(2)) {
  const onClose = vi.fn<(result: CoverEditorResult) => void>();
  const view = render(<CoverEditor title="Weeknight Dinners" design={design} onClose={onClose} />);
  const node = (id: string) =>
    view.container.querySelector<HTMLElement>(`[data-element-id="${id}"]`)!;
  const handle = (selector: string) => view.container.querySelector<HTMLElement>(selector)!;
  async function result() {
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    return onClose.mock.calls.at(-1)![0];
  }
  return { ...view, node, handle, result };
}

const down = (target: Element, clientX: number, clientY: number) =>
  fireEvent.pointerDown(target, { button: 0, clientX, clientY });
const move = (clientX: number, clientY: number) =>
  fireEvent.pointerMove(window, { clientX, clientY });
const up = () => fireEvent.pointerUp(window);

/** A filled rectangle in the middle of the board, 0.5 wide and 0.2 tall. */
const rect: ShapeElement = {
  id: "box",
  type: "shape",
  shape: "rect",
  x: 0.5,
  y: 0.5,
  w: 0.5,
  h: 0.2,
  rotation: 0,
  color: "white",
  outline: false,
};
const plainWith = (...elements: CoverElement[]) =>
  coverDesign(2, { coverStyle: "PLAIN", coverElements: elements });

describe("CoverCanvas — dragging an element", () => {
  it("moves it by as much of the cover as the pointer travelled", async () => {
    const { node, result } = renderEditor();

    // The title starts at (0.525, 0.5): 157.5px across, 200px down.
    down(node("title"), 150, 200);
    move(180, 240);
    up();

    const title = titleElement((await result()).design.coverElements)!;
    expect(title.x).toBeCloseTo(0.625);
    expect(title.y).toBeCloseTo(0.6);
  });

  it("is one step of undo, however many moves it took", async () => {
    const { node, result } = renderEditor();

    down(node("title"), 150, 200);
    move(160, 210);
    move(170, 220);
    move(180, 240);
    up();
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(titleElement((await result()).design.coverElements)).toMatchObject({ x: 0.525, y: 0.5 });
  });

  // Close to the middle, it settles on the middle, and a guide says so.
  it("snaps to the centre line and shows the guide while it is there", async () => {
    const { node, container, result } = renderEditor();
    // The guide that runs top to bottom of the board (the rotate knob's stalk
    // is drawn in the same colour, but is short).
    const guides = () => container.querySelectorAll('span[class*="inset-y-0"][class*="bg-accent"]');

    down(node("title"), 150, 200);
    // 0.525 − 6/300 = 0.505: within the snap distance of 0.5.
    move(144, 260);
    expect(guides()).toHaveLength(1);
    up();
    expect(guides()).toHaveLength(0);

    expect(titleElement((await result()).design.coverElements)!.x).toBe(0.5);
  });

  it("can't be dragged off the cover", async () => {
    const { node, result } = renderEditor();

    down(node("title"), 150, 200);
    move(2000, -2000);
    up();

    expect(titleElement((await result()).design.coverElements)).toMatchObject({ x: 1, y: 0 });
  });
});

describe("CoverCanvas — the handles", () => {
  // Centre of the title: (157.5, 200).
  it("resizes about the centre from a corner, type and all", async () => {
    const { node, handle, result } = renderEditor();
    down(node("title"), 150, 200);
    up();

    // 100px from the centre, pulled out to 150px: half as big again.
    down(handle(".cursor-nwse-resize"), 257.5, 200);
    move(307.5, 200);
    up();

    const title = titleElement((await result()).design.coverElements)!;
    expect(title.w).toBeCloseTo(0.7 * 1.5);
    expect(title.size).toBeCloseTo(8.3 * 1.5, 1);
    // Resized where it stands.
    expect(title).toMatchObject({ x: 0.525, y: 0.5 });
  });

  // The knob sits above the element, so straight up is "not turned": pulling
  // it round to the right of the centre is a quarter turn.
  it("turns the element to follow the knob", async () => {
    const { node, handle, result } = renderEditor();
    down(node("title"), 150, 200);
    up();

    down(handle(".cursor-grab.rounded-full"), 157.5, 150);
    move(257.5, 200);
    up();

    expect(titleElement((await result()).design.coverElements)!.rotation).toBe(90);
  });

  it("settles on a round angle when the knob comes close to one", async () => {
    const { node, handle, result } = renderEditor();
    down(node("title"), 150, 200);
    up();

    down(handle(".cursor-grab.rounded-full"), 157.5, 150);
    // A couple of degrees short of 45°.
    move(257.5, 200 - 96);
    up();

    expect(titleElement((await result()).design.coverElements)!.rotation).toBe(45);
  });

  it("stretches a shape one way from a side handle", async () => {
    const { node, handle, result } = renderEditor(plainWith(rect));
    down(node("box"), 150, 200);
    up();

    // The right-hand handle, pulled to 120px from the centre: 240px wide.
    down(handle('[data-side="e"]'), 225, 200);
    move(270, 200);
    up();
    // The bottom handle, pulled to 100px below the centre: 200px tall.
    down(handle('[data-side="s"]'), 150, 240);
    move(150, 300);
    up();

    expect((await result()).design.coverElements[0]).toMatchObject({ w: 0.8, h: 0.5 });
  });

  // Text wraps, so its height is whatever its words need: only the width.
  it("gives text a width handle and no height handle", () => {
    const { node, handle } = renderEditor();
    down(node("title"), 150, 200);
    up();

    expect(handle('[data-side="e"]')).not.toBeNull();
    expect(handle('[data-side="s"]')).toBeNull();
  });
});

describe("CoverCanvas — a background photo", () => {
  const photoCover = coverDesign(2, { coverStyle: "PHOTO", coverImageUrl: BLOB });

  // Dragging the picture right reveals more of its left: the point pinned to
  // the frame moves the other way.
  it("reframes when the empty board is dragged", async () => {
    const { result } = renderEditor(photoCover);

    down(screen.getByRole("group", { name: /Photo position/ }), 100, 100);
    move(130, 140);
    up();

    const { design } = await result();
    expect(design.coverFocalX).toBeCloseTo(0.4);
    expect(design.coverFocalY).toBeCloseTo(0.4);
  });
});

describe("CoverCanvas — pressing through a hollow shape", () => {
  const frame: ShapeElement = { ...rect, id: "frame", shape: "frame", w: 0.8, h: 0.9 };
  const panel = () => screen.getByRole("region", { name: /Selected element|Background/ });

  /** Stand in for the browser's hit-testing: these nodes, topmost first. */
  function under(...nodes: Element[]) {
    (document as { elementsFromPoint?: unknown }).elementsFromPoint = () => nodes;
  }

  // The frame is above the box and nearly the size of the cover. A press in
  // its empty middle has to reach the box underneath.
  it("picks up what is underneath the empty middle of a frame", () => {
    const { node } = renderEditor(plainWith(rect, frame));
    under(node("frame"), node("box"));

    down(node("frame"), 150, 200);
    up();

    expect(within(panel()).getByRole("heading", { name: "Rectangle" })).toBeInTheDocument();
  });

  it("picks up the frame itself on its line", () => {
    const { node } = renderEditor(plainWith(rect, frame));
    under(node("frame"), node("box"));

    // The frame's right edge: 0.5 × 300 + 0.4 × 300 = 270px across.
    down(node("frame"), 270, 200);
    up();

    expect(within(panel()).getByRole("heading", { name: "Frame" })).toBeInTheDocument();
  });

  it("lets go of the selection when there is nothing under the middle", async () => {
    const { node } = renderEditor(plainWith(frame));
    under(node("frame"));

    down(node("frame"), 270, 200);
    up();
    expect(within(panel()).getByRole("heading", { name: "Frame" })).toBeInTheDocument();

    down(node("frame"), 150, 200);
    up();
    expect(within(panel()).getByRole("heading", { name: "Background" })).toBeInTheDocument();
  });
});
