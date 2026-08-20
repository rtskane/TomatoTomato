// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import BookCover from "./book-cover";

afterEach(cleanup);

const BLOB =
  "https://abc123.public.blob.vercel-storage.com/cookbook-covers/a.jpg";

function renderCover(props: Partial<React.ComponentProps<typeof BookCover>> = {}) {
  return render(
    <BookCover
      title="Weeknight Dinners"
      coverColor={2}
      coverStyle="TITLED"
      coverImageUrl={null}
      {...props}
    />,
  );
}

describe("BookCover — the three styles", () => {
  it("prints the title on the cloth when TITLED", () => {
    renderCover();
    expect(screen.getByText("Weeknight Dinners")).toBeInTheDocument();
  });

  it("shows nothing but the cloth when PLAIN", () => {
    const { container } = renderCover({ coverStyle: "PLAIN" });

    expect(screen.queryByText("Weeknight Dinners")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("fills the board with the picture when PHOTO", () => {
    const { container } = renderCover({
      coverStyle: "PHOTO",
      coverImageUrl: BLOB,
    });

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    // Decorative: every caller names the cookbook in text beside or beneath it.
    expect(img!.getAttribute("alt")).toBe("");
    // The printed title would sit on top of the photograph.
    expect(screen.queryByText("Weeknight Dinners")).toBeNull();
  });
});

describe("BookCover — a style it cannot draw", () => {
  // The schema folds this away on write, so reaching it means older data or a
  // hand-edited row. Falling back to the cloth beats an empty board.
  it("falls back to the printed title when PHOTO has no picture", () => {
    const { container } = renderCover({
      coverStyle: "PHOTO",
      coverImageUrl: null,
    });

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("Weeknight Dinners")).toBeInTheDocument();
  });
});

describe("BookCover — the colour", () => {
  it("wears the cloth it was given", () => {
    const { container } = renderCover({ coverColor: 7 });
    expect(container.firstElementChild!.className).toContain("bg-book-cover-7");
  });

  it("draws the spine in that cover's own ink", () => {
    const { container } = renderCover({ coverColor: 7 });
    const spine = container.querySelector("span");
    expect(spine!.className).toContain("book-ink-7");
  });

  it("renders a real cover even for a colour outside the palette", () => {
    const { container } = renderCover({ coverColor: 99 });
    expect(container.firstElementChild!.className).toContain("bg-book-cover-");
  });
});

describe("BookCover — sizes", () => {
  it("leaves the title off a chip, which is too small to set type on", () => {
    renderCover({ size: "chip" });
    expect(screen.queryByText("Weeknight Dinners")).toBeNull();
  });

  it("still shows the picture on a chip", () => {
    const { container } = renderCover({
      size: "chip",
      coverStyle: "PHOTO",
      coverImageUrl: BLOB,
    });
    expect(container.querySelector("img")).not.toBeNull();
  });

  // The box is the caller's business — the shelf wants a fluid width and the
  // designer a fixed one, so neither can be baked in.
  it("takes its dimensions from the caller", () => {
    const { container } = renderCover({ className: "aspect-3/4 w-32" });
    expect(container.firstElementChild!.className).toContain("w-32");
  });
});
