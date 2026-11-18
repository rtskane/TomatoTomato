// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CoverEditor, { type CoverEditorResult } from "./cover-editor";
import { coverDesign } from "./book-cover";
import { upload } from "@vercel/blob/client";
import { LIMITS, titleElement } from "@/lib/cover-elements";
import { createSticker } from "@/lib/cover-editing";
import { COVER_TEMPLATES, blankDesign, templateDesign } from "@/lib/cover-templates";

// The real one talks to Vercel. What matters here is what the editor does
// once a URL comes back.
vi.mock("@vercel/blob/client", () => ({ upload: vi.fn() }));

const uploadMock = vi.mocked(upload);

const BLOB = "https://abc123.public.blob.vercel-storage.com/cookbook-covers/a.jpg";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  uploadMock.mockResolvedValue({ url: BLOB } as Awaited<ReturnType<typeof upload>>);
});

function imageFile() {
  const file = new File(["x"], "cover.jpg", { type: "image/jpeg" });
  Object.defineProperty(file, "size", { value: 1024 });
  return file;
}

function renderEditor(props: Partial<React.ComponentProps<typeof CoverEditor>> = {}) {
  const onClose = vi.fn<(result: CoverEditorResult) => void>();
  const view = render(
    <CoverEditor title="Weeknight Dinners" design={blankDesign(2)} onClose={onClose} {...props} />,
  );
  return { ...view, onClose };
}

/**
 * The book face itself — the element carrying the cloth colour. Found by the
 * board's `@container`, because the colour swatches wear the same cloth
 * classes and come first in the document.
 */
function face(container: HTMLElement) {
  return container.querySelector("[class*='@container'][class*='bg-book-cover-']")!;
}

function element(container: HTMLElement, id: string) {
  return container.querySelector<HTMLElement>(`[data-element-id="${id}"]`)!;
}

/** Press an element on the canvas, the way a pointer selects it. */
function press(node: HTMLElement) {
  fireEvent.pointerDown(node, { button: 0, clientX: 0, clientY: 0 });
  fireEvent.pointerUp(window);
}

/** Leave by the primary button and return what the editor handed back. */
async function done(user: ReturnType<typeof userEvent.setup>, onClose: ReturnType<typeof vi.fn>) {
  await user.click(screen.getByRole("button", { name: "Done" }));
  return onClose.mock.calls.at(-1)![0] as CoverEditorResult;
}

const tool = (name: string) =>
  within(screen.getByRole("navigation", { name: "Add to the cover" })).getByRole("button", { name });

describe("CoverEditor — the name is on the cover", () => {
  it("draws the cookbook's name on the book", () => {
    const { container } = renderEditor();
    expect(element(container, "title")).toHaveTextContent("Weeknight Dinners");
  });

  // The point of having the name in here: try one, and see it on the cover.
  it("redraws the cover as the name is typed", async () => {
    const user = userEvent.setup();
    const { container } = renderEditor();

    const name = screen.getByRole("textbox", { name: "Cookbook name" });
    await user.clear(name);
    await user.type(name, "Sunday Roasts");

    expect(element(container, "title")).toHaveTextContent("Sunday Roasts");
  });

  it("hands the new name back with the cover", async () => {
    const user = userEvent.setup();
    const { onClose } = renderEditor();

    const name = screen.getByRole("textbox", { name: "Cookbook name" });
    await user.clear(name);
    await user.type(name, "Sunday Roasts");

    expect((await done(user, onClose)).title).toBe("Sunday Roasts");
  });

  it("stands in a name on the book for a cookbook that has none yet", () => {
    const { container } = renderEditor({ title: "  " });
    expect(element(container, "title")).toHaveTextContent("Untitled cookbook");
  });

  // Selecting the title edits the *name*, not a copy of it.
  it("renames the cookbook from the selected title", async () => {
    const user = userEvent.setup();
    const { container } = renderEditor();

    press(element(container, "title"));
    const field = screen.getByRole("textbox", { name: "Name" });
    await user.type(field, "!");

    expect(screen.getByRole("textbox", { name: "Cookbook name" })).toHaveValue("Weeknight Dinners!");
    expect(element(container, "title")).toHaveTextContent("Weeknight Dinners!");
  });

  it("offers no copy of the name, and offers it back once removed", async () => {
    const user = userEvent.setup();
    const { container } = renderEditor();

    press(element(container, "title"));
    expect(screen.queryByRole("button", { name: "Duplicate" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Remove from cover" }));
    expect(element(container, "title")).toBeNull();

    await user.click(tool("Text"));
    await user.click(screen.getByRole("button", { name: /Add the cookbook.s name/ }));
    expect(container.querySelector('[data-element-id]')).toHaveTextContent("Weeknight Dinners");
    // There is one name, so the offer goes once it is back on the cover.
    await user.click(tool("Text"));
    expect(screen.queryByRole("button", { name: /Add the cookbook.s name/ })).toBeNull();
  });
});

describe("CoverEditor — opening an older cover", () => {
  // A cover from before the title could be moved keeps it on a fixed plate.
  // In here it is ordinary elements, in the same place.
  it("turns the title plate into things that can be picked up", async () => {
    const user = userEvent.setup();
    const { container, onClose } = renderEditor({
      design: coverDesign(2, { coverTitleFont: "SANS" }),
    });

    expect(screen.getAllByText("Weeknight Dinners")).toHaveLength(1);
    expect(element(container, "plate-title").className).toContain("font-sans");
    expect(element(container, "plate-frame")).not.toBeNull();

    // Once something is changed, the cover that comes back carries the
    // title as an element — that is what gets saved.
    await user.click(screen.getByRole("button", { name: "Oxblood" }));
    const { design } = await done(user, onClose);
    expect(titleElement(design.coverElements)?.id).toBe("plate-title");
  });

  // Merely looking at an older cover must not rewrite its plate as elements:
  // the caller gets the cover it passed in, and can tell nothing changed.
  it("hands an older cover back untouched when nothing was changed", async () => {
    const user = userEvent.setup();
    const design = coverDesign(2);
    const { onClose } = renderEditor({ design });

    expect((await done(user, onClose)).design).toBe(design);
  });

  it("hands it back untouched when every change was undone, too", async () => {
    const user = userEvent.setup();
    const design = coverDesign(2);
    const { onClose } = renderEditor({ design });

    await user.click(screen.getByRole("button", { name: "Oxblood" }));
    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect((await done(user, onClose)).design).toBe(design);
  });

  // A drag is a different path into history from a button, and has to keep
  // the same promise.
  it("hands it back untouched when a move was undone", async () => {
    const user = userEvent.setup();
    const design = coverDesign(2);
    const { container, onClose } = renderEditor({ design });

    press(element(container, "plate-title"));
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect((await done(user, onClose)).design).toBe(design);
  });

  // Pressing something without moving it isn't a change worth a step of undo.
  it("remembers nothing for a press that moved nothing", () => {
    const { container } = renderEditor();

    press(element(container, "title"));

    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
  });

  it("hands back the very cover it was given when nothing was touched", async () => {
    const user = userEvent.setup();
    const design = blankDesign(2);
    const { onClose } = renderEditor({ design });

    expect((await done(user, onClose)).design).toBe(design);
  });
});

describe("CoverEditor — the background", () => {
  it("offers one swatch per cover, each named rather than numbered", () => {
    renderEditor();
    // The name is what a screen reader announces — "colour 6" would be useless.
    expect(screen.getByRole("button", { name: "Garnet" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Linen" })).toBeInTheDocument();
  });

  it("repaints the book and hands back the new colour", async () => {
    const user = userEvent.setup();
    const { container, onClose } = renderEditor();

    await user.click(screen.getByRole("button", { name: "Oxblood" }));

    expect(face(container).className).toContain("bg-book-cover-6");
    expect((await done(user, onClose)).design.coverColor).toBe(6);
  });

  // Garnet carries white ink and Linen dark: a white name moved to Linen
  // unchanged would vanish into it.
  it("keeps the name legible when the cloth goes from dark to pale", async () => {
    const user = userEvent.setup();
    const { container } = renderEditor();
    expect(element(container, "title").style.color).toBe("var(--color-book-ink-1)");

    await user.click(screen.getByRole("button", { name: "Linen" }));

    expect(element(container, "title").style.color).toBe("var(--color-book-cover-1)");
  });

  it("prints the pattern on the book", async () => {
    const user = userEvent.setup();
    const { container, onClose } = renderEditor();

    await user.click(screen.getByRole("button", { name: "Gingham" }));

    expect(container.querySelector(".cover-weave-gingham")).not.toBeNull();
    expect((await done(user, onClose)).design.coverTexture).toBe("GINGHAM");
  });

  // A photo goes on a cover as something placed (the Photo tool). Filling
  // the whole board with one is no longer on offer.
  it("offers no way to fill the cover with a photo", () => {
    renderEditor();

    expect(screen.queryByLabelText(/Fill the cover with a photo/)).toBeNull();
    expect(screen.queryByRole("group", { name: "Background photo" })).toBeNull();
    expect(screen.queryByRole("slider", { name: "Zoom" })).toBeNull();
  });

  describe("a cover that already has a background photo", () => {
    const photoCover = coverDesign(2, { coverStyle: "PHOTO", coverImageUrl: BLOB });

    // Made before the option went away. It still has to be adjustable.
    it("can still be zoomed, but not swapped for another", () => {
      const { container } = renderEditor({ design: photoCover });

      expect(container.querySelector("img")).not.toBeNull();
      expect(screen.getByRole("slider", { name: "Zoom" })).toBeInTheDocument();
      expect(screen.queryByLabelText(/Replace photo/)).toBeNull();
      // The weave is printed on cloth: it has nothing to say under a photograph.
      expect(screen.queryByRole("button", { name: "Gingham" })).toBeNull();
    });

    it("can go back to cloth, after which the photo controls are gone", async () => {
      const user = userEvent.setup();
      const { container, onClose } = renderEditor({ design: photoCover });

      await user.click(screen.getByRole("button", { name: "Remove photo" }));

      expect(container.querySelector("img")).toBeNull();
      expect(screen.queryByRole("slider", { name: "Zoom" })).toBeNull();
      expect(screen.getByRole("button", { name: "Gingham" })).toBeInTheDocument();
      const { design } = await done(user, onClose);
      // A photo cover never showed its title, so it comes back PLAIN.
      expect(design).toMatchObject({ coverImageUrl: null, coverStyle: "PLAIN" });
    });

    it("comes back as a photo cover when only other things were changed", async () => {
      const user = userEvent.setup();
      const { onClose } = renderEditor({ design: photoCover });

      await user.click(tool("Stickers"));
      await user.click(screen.getByRole("button", { name: "Tomato" }));

      const { design } = await done(user, onClose);
      expect(design).toMatchObject({ coverImageUrl: BLOB, coverStyle: "PHOTO" });
    });
  });

  it("can't be left while a placed photo is still uploading", async () => {
    const user = userEvent.setup();
    let finish: (value: Awaited<ReturnType<typeof upload>>) => void = () => {};
    uploadMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderEditor();

    await user.click(tool("Photo"));
    await user.upload(screen.getByLabelText("Upload a photo"), imageFile());
    expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();

    finish({ url: BLOB } as Awaited<ReturnType<typeof upload>>);
    await waitFor(() => expect(screen.getByRole("button", { name: "Done" })).toBeEnabled());
  });
});

describe("CoverEditor — new things can be seen", () => {
  // Picnic has a white label in the middle of a dark cloth, which is exactly
  // where a new text box lands.
  it("starts new text in a colour that reads on the label it lands on", async () => {
    const user = userEvent.setup();
    const picnic = COVER_TEMPLATES.find((t) => t.id === "picnic")!;
    const { onClose } = renderEditor({ design: templateDesign(picnic) });

    await user.click(tool("Text"));
    await user.click(screen.getByRole("button", { name: "Add a heading" }));

    const { design } = await done(user, onClose);
    expect(design.coverElements.at(-1)).toMatchObject({ type: "text", color: "cover-1" });
  });
});

describe("CoverEditor — placing things on the cover", () => {
  it("draws a sticker on the book and hands it back", async () => {
    const user = userEvent.setup();
    const { container, onClose } = renderEditor();

    await user.click(tool("Stickers"));
    await user.click(screen.getByRole("button", { name: "Tomato" }));

    expect(container.querySelectorAll("[data-element-id]")).toHaveLength(2);
    const { design } = await done(user, onClose);
    expect(design.coverElements.at(-1)).toMatchObject({ type: "sticker", sticker: "tomato" });
  });

  it("goes straight to the words of a new text box", async () => {
    const user = userEvent.setup();
    const { container } = renderEditor();

    await user.click(tool("Text"));
    await user.click(screen.getByRole("button", { name: "Add a heading" }));

    const field = screen.getByRole("textbox", { name: "Text" });
    expect(field).toHaveFocus();
    await user.keyboard("Est. 1987");
    expect(container).toHaveTextContent("Est. 1987");
  });

  it("offers every shape, the frame among them", async () => {
    const user = userEvent.setup();
    const { onClose } = renderEditor();

    await user.click(tool("Shapes"));
    await user.click(screen.getByRole("button", { name: "Frame" }));

    const { design } = await done(user, onClose);
    expect(design.coverElements.at(-1)).toMatchObject({ type: "shape", shape: "frame" });
  });

  it("places an uploaded photo as something to move, not as the background", async () => {
    const user = userEvent.setup();
    const { onClose } = renderEditor();

    await user.click(tool("Photo"));
    await user.upload(screen.getByLabelText("Upload a photo"), imageFile());
    await waitFor(() => expect(screen.getByRole("heading", { name: "Photo" })).toBeInTheDocument());

    const { design } = await done(user, onClose);
    expect(design.coverImageUrl).toBeNull();
    expect(design.coverElements.at(-1)).toMatchObject({ type: "photo", url: BLOB });
  });

  it("says when a cover is full rather than letting more be added", async () => {
    const user = userEvent.setup();
    const stickers = Array.from({ length: LIMITS.sticker }, (_, i) => ({
      ...createSticker([], "star")!,
      id: `s${i}`,
    }));
    renderEditor({ design: { ...blankDesign(2), coverElements: stickers } });

    await user.click(tool("Stickers"));

    expect(screen.getByRole("button", { name: "Tomato" })).toBeDisabled();
    expect(screen.getByText(/holds up to 8 stickers/)).toBeInTheDocument();
  });
});

describe("CoverEditor — undo", () => {
  it("brings back a deleted element", async () => {
    const user = userEvent.setup();
    const { container } = renderEditor();

    await user.click(tool("Stickers"));
    await user.click(screen.getByRole("button", { name: "Heart" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(container.querySelectorAll("[data-element-id]")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(container.querySelectorAll("[data-element-id]")).toHaveLength(2);
  });

  // One history for the whole cover: the cloth undoes the same way a
  // sticker does.
  it("steps back through the background too, and forward again", async () => {
    const user = userEvent.setup();
    const { container } = renderEditor();

    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Oxblood" }));
    await user.click(screen.getByRole("button", { name: "Grid" }));

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(container.querySelector(".cover-weave-grid")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(face(container).className).toContain("bg-book-cover-2");

    await user.click(screen.getByRole("button", { name: "Redo" }));
    expect(face(container).className).toContain("bg-book-cover-6");
  });

  it("treats a run of typing as one step", async () => {
    const user = userEvent.setup();
    const { container } = renderEditor();

    await user.click(tool("Text"));
    await user.click(screen.getByRole("button", { name: "Add a small note" }));
    await user.keyboard("abc");
    expect(container).toHaveTextContent("abc");

    // One undo for the typing, one for adding the box.
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(container).toHaveTextContent("A small note");
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(container.querySelectorAll("[data-element-id]")).toHaveLength(1);
  });
});

describe("CoverEditor — the selected element", () => {
  it("restyles text on the book as its controls change", async () => {
    const user = userEvent.setup();
    const { container } = renderEditor();

    press(element(container, "title"));
    await user.click(screen.getByRole("button", { name: "Mono" }));
    await user.click(screen.getByRole("button", { name: "Bold" }));

    expect(element(container, "title").className).toContain("font-mono");
    expect(element(container, "title").className).toContain("font-bold");
  });

  it("lets go of the selection and shows the tools again", async () => {
    const user = userEvent.setup();
    const { container } = renderEditor();

    press(element(container, "title"));
    expect(screen.queryByRole("heading", { name: "Background" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Deselect" }));
    expect(screen.getByRole("heading", { name: "Background" })).toBeInTheDocument();
  });

  it("resizes and turns the selected element from the keyboard", async () => {
    const user = userEvent.setup();
    const { container, onClose } = renderEditor();

    press(element(container, "title"));
    await user.keyboard("]");
    await user.keyboard("+");

    const title = titleElement((await done(user, onClose)).design.coverElements)!;
    expect(title.rotation).toBe(15);
    expect(title.size).toBeGreaterThan(8.3);
  });
});

describe("CoverEditor — a primary action", () => {
  const action = (overrides: Partial<NonNullable<React.ComponentProps<typeof CoverEditor>["action"]>> = {}) => ({
    label: "Create cookbook",
    pendingLabel: "Creating…",
    pending: false,
    run: vi.fn(),
    ...overrides,
  });

  it("runs with the cover as it stands, and keeps a separate way back", async () => {
    const user = userEvent.setup();
    const create = action();
    const { onClose } = renderEditor({ action: create, closeLabel: "Covers" });

    await user.click(screen.getByRole("button", { name: "Oxblood" }));
    await user.click(screen.getByRole("button", { name: "Create cookbook" }));

    expect(create.run).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Weeknight Dinners", design: expect.objectContaining({ coverColor: 6 }) }),
    );
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Covers" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // On a phone the bar is short of room, so the button can say less — but it
  // is still called by its full name.
  it("keeps its full name when it is given a shorter one to show", () => {
    renderEditor({ action: action({ shortLabel: "Create" }) });

    const button = screen.getByRole("button", { name: "Create cookbook" });
    expect(button).toHaveTextContent("Create");
  });

  it("says so while it is running, and shows what went wrong", () => {
    renderEditor({ action: action({ pending: true, error: "Give your cookbook a title." }) });

    expect(screen.getByRole("button", { name: "Creating…" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Give your cookbook a title.");
  });
});

describe("CoverEditor — arranging and copying", () => {
  async function withTwoStickers() {
    const user = userEvent.setup();
    // A plain cover: nothing on it, and no title plate to turn into elements.
    const view = renderEditor({ design: coverDesign(2, { coverStyle: "PLAIN" }) });
    await user.click(tool("Stickers"));
    await user.click(screen.getByRole("button", { name: "Tomato" }));
    await user.click(tool("Stickers"));
    await user.click(screen.getByRole("button", { name: "Lemon" }));
    return { user, ...view };
  }
  const order = (result: CoverEditorResult) =>
    result.design.coverElements.map((e) => (e.type === "sticker" ? e.sticker : e.type));

  // The list order is the stacking order: later is higher.
  it("moves the selected element down the stack, and back up", async () => {
    const { user, onClose } = await withTwoStickers();
    // The lemon was added last, so it is selected and on top.
    expect(screen.getByRole("button", { name: "Forward" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Backward" }));
    expect(screen.getByRole("button", { name: "Backward" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(order(onClose.mock.calls[0][0])).toEqual(["lemon", "tomato"]);

    await user.click(screen.getByRole("button", { name: "Forward" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(order(onClose.mock.calls[1][0])).toEqual(["tomato", "lemon"]);
  });

  it("makes a copy just above the original, and selects it", async () => {
    const { user, container, onClose } = await withTwoStickers();

    await user.click(screen.getByRole("button", { name: "Duplicate" }));

    expect(container.querySelectorAll("[data-element-id]")).toHaveLength(3);
    expect(screen.getByRole("heading", { name: "Lemon" })).toBeInTheDocument();
    expect(order(await done(user, onClose))).toEqual(["tomato", "lemon", "lemon"]);
  });
});

describe("CoverEditor — each kind's own controls", () => {
  it("recolours a shape and turns it into an outline", async () => {
    const user = userEvent.setup();
    const { onClose } = renderEditor();

    await user.click(tool("Shapes"));
    await user.click(screen.getByRole("button", { name: "Circle" }));
    await user.click(screen.getByRole("button", { name: "Alpine Amber" }));
    await user.click(screen.getByRole("button", { name: "Outline" }));

    const { design } = await done(user, onClose);
    expect(design.coverElements.at(-1)).toMatchObject({
      shape: "circle",
      color: "cover-4",
      outline: true,
    });
  });

  // A line or a triangle has no hollow form to offer.
  it("offers no outline for a shape that can't be one", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(tool("Shapes"));
    await user.click(screen.getByRole("button", { name: "Line" }));

    expect(screen.queryByRole("button", { name: "Outline" })).toBeNull();
  });

  it("crops a placed photo to a shape", async () => {
    const user = userEvent.setup();
    const { onClose } = renderEditor();

    await user.click(tool("Photo"));
    await user.upload(screen.getByLabelText("Upload a photo"), imageFile());
    await user.click(await screen.findByRole("button", { name: "Round" }));

    const { design } = await done(user, onClose);
    expect(design.coverElements.at(-1)).toMatchObject({ type: "photo", mask: "circle" });
  });

  it("aligns, slants and sizes text", async () => {
    const user = userEvent.setup();
    const { container, onClose } = renderEditor();

    press(element(container, "title"));
    await user.click(screen.getByRole("button", { name: "Left" }));
    await user.click(screen.getByRole("button", { name: "Italic" }));
    fireEvent.change(screen.getByRole("slider", { name: "Size" }), { target: { value: "12" } });

    const title = titleElement((await done(user, onClose)).design.coverElements)!;
    expect(title).toMatchObject({ align: "left", italic: true, size: 12 });
  });

  it("says why a photo didn't upload", async () => {
    const user = userEvent.setup();
    uploadMock.mockRejectedValue(new Error("store is down"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    renderEditor();

    await user.click(tool("Photo"));
    await user.upload(screen.getByLabelText("Upload a photo"), imageFile());

    expect(await screen.findByRole("alert")).toHaveTextContent("That didn't upload");
    quiet.mockRestore();
  });

  // A double-click on text is "let me change these words".
  it("goes to a text box's words on a double-click", async () => {
    const user = userEvent.setup();
    const { container } = renderEditor();

    await user.click(tool("Text"));
    await user.click(screen.getByRole("button", { name: "Add a subheading" }));
    await user.click(screen.getByRole("button", { name: "Deselect" }));
    fireEvent.doubleClick(screen.getByText("Subheading", { selector: "[data-element-id]" }));

    expect(screen.getByRole("textbox", { name: "Text" })).toHaveFocus();
    expect(container.querySelectorAll("[data-element-id]")).toHaveLength(2);
  });
});

describe("CoverEditor — a background photo from before", () => {
  const photoCover = coverDesign(2, { coverStyle: "PHOTO", coverImageUrl: BLOB });
  const board = () => screen.getByRole("group", { name: /Photo position/ });

  it("zooms with the slider", async () => {
    const user = userEvent.setup();
    const { onClose } = renderEditor({ design: photoCover });

    fireEvent.change(screen.getByRole("slider", { name: "Zoom" }), { target: { value: "2" } });

    expect((await done(user, onClose)).design.coverZoom).toBe(2);
  });

  it("says where the photograph sits, for someone who can't see it", () => {
    renderEditor({ design: photoCover });
    expect(board()).toHaveAccessibleName(/50% across, 50% down/);
  });

  it("reframes with the arrow keys, and can't be nudged outside the picture", async () => {
    const user = userEvent.setup();
    const { onClose } = renderEditor({ design: photoCover });

    board().focus();
    await user.keyboard("{ArrowRight}{ArrowDown}");
    let { design } = await done(user, onClose);
    expect(design.coverFocalX).toBeCloseTo(0.52);
    expect(design.coverFocalY).toBeCloseTo(0.52);

    board().focus();
    await user.keyboard("{ArrowLeft>40/}");
    ({ design } = await done(user, onClose));
    expect(design.coverFocalX).toBe(0);
  });
});

describe("CoverEditor — the keyboard", () => {
  it("undoes and redoes with the usual keys", async () => {
    const user = userEvent.setup();
    const { container } = renderEditor();

    await user.click(screen.getByRole("button", { name: "Oxblood" }));
    await user.keyboard("{Meta>}z{/Meta}");
    expect(face(container).className).toContain("bg-book-cover-2");

    await user.keyboard("{Meta>}{Shift>}z{/Shift}{/Meta}");
    expect(face(container).className).toContain("bg-book-cover-6");
  });

  // In a text field the browser's own undo of the typing is the one wanted.
  it("leaves undo alone inside a text field", async () => {
    const user = userEvent.setup();
    const { container } = renderEditor();

    await user.click(screen.getByRole("button", { name: "Oxblood" }));
    await user.click(screen.getByRole("textbox", { name: "Cookbook name" }));
    await user.keyboard("{Meta>}z{/Meta}");

    expect(face(container).className).toContain("bg-book-cover-6");
  });

  it("deletes the selected element with Delete", async () => {
    const user = userEvent.setup();
    const { container } = renderEditor();

    press(element(container, "title"));
    await user.keyboard("{Delete}");

    expect(container.querySelectorAll("[data-element-id]")).toHaveLength(0);
  });
});

describe("CoverEditor — leaving", () => {
  const dialog = () => screen.getByRole("dialog", { name: "Cover editor" });

  // Escape reaches a modal dialog as a `cancel` event.
  it("leaves on Escape, keeping the work", async () => {
    const user = userEvent.setup();
    const { onClose } = renderEditor();

    await user.click(screen.getByRole("button", { name: "Oxblood" }));
    fireEvent(dialog(), new Event("cancel", { cancelable: true }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose.mock.calls[0][0].design.coverColor).toBe(6);
  });

  it("doesn't leave on Escape while a photo is still uploading", async () => {
    const user = userEvent.setup();
    uploadMock.mockReturnValue(new Promise(() => {}));
    const { onClose } = renderEditor();

    await user.click(tool("Photo"));
    await user.upload(screen.getByLabelText("Upload a photo"), imageFile());
    fireEvent(dialog(), new Event("cancel", { cancelable: true }));

    expect(onClose).not.toHaveBeenCalled();
  });

  // The browser can close a modal without asking (a second Escape, for one).
  // The editor then has to leave properly, not sit open-but-invisible.
  it("hands the cover back if the browser closes the dialog itself", async () => {
    const user = userEvent.setup();
    const { onClose } = renderEditor();

    await user.click(screen.getByRole("button", { name: "Oxblood" }));
    (dialog() as HTMLDialogElement).close();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose.mock.calls[0][0].design.coverColor).toBe(6);
  });

  // Its own going-away closes the dialog too, and that must not be read as
  // the browser closing it: the caller would be told twice.
  it("hands the cover back once, not again as it unmounts", async () => {
    const user = userEvent.setup();
    const { onClose, unmount } = renderEditor();

    await user.click(screen.getByRole("button", { name: "Done" }));
    unmount();

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
