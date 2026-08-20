// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import BookCover, { coverDesign } from "./book-cover";

afterEach(cleanup);

const BLOB =
  "https://abc123.public.blob.vercel-storage.com/cookbook-covers/a.jpg";

/**
 * `design` overrides are merged into the default cover rather than replacing
 * it, so each test names only the one property it is about.
 */
function renderCover({
  design = {},
  ...props
}: Partial<Omit<React.ComponentProps<typeof BookCover>, "design">> & {
  design?: Partial<ReturnType<typeof coverDesign>>;
} = {}) {
  return render(
    <BookCover
      title="Weeknight Dinners"
      design={coverDesign(2, design)}
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
    const { container } = renderCover({ design: { coverStyle: "PLAIN" } });

    expect(screen.queryByText("Weeknight Dinners")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("fills the board with the picture when PHOTO", () => {
    const { container } = renderCover({
      design: { coverStyle: "PHOTO", coverImageUrl: BLOB },
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
      design: { coverStyle: "PHOTO", coverImageUrl: null },
    });

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("Weeknight Dinners")).toBeInTheDocument();
  });
});

describe("BookCover — the colour", () => {
  it("wears the cloth it was given", () => {
    const { container } = renderCover({ design: { coverColor: 7 } });
    expect(container.firstElementChild!.className).toContain("bg-book-cover-7");
  });

  it("draws the spine in that cover's own ink", () => {
    const { container } = renderCover({ design: { coverColor: 7 } });
    const spine = container.querySelector("span");
    expect(spine!.className).toContain("book-ink-7");
  });

  it("renders a real cover even for a colour outside the palette", () => {
    const { container } = renderCover({ design: { coverColor: 99 } });
    expect(container.firstElementChild!.className).toContain("bg-book-cover-");
  });
});

describe("BookCover — the composed cover", () => {
  it("prints the weave on the cloth, in that cover's own ink", () => {
    const { container } = renderCover({
      design: { coverColor: 3, coverTexture: "LINEN" },
    });

    const weave = container.querySelector(".cover-weave-linen");
    expect(weave).not.toBeNull();
    // The pattern is drawn in currentColor, so the ink class is what makes it
    // belong to this cover rather than being a fixed grey.
    expect(weave!.className).toContain("text-book-ink-3");
  });

  it("prints no weave when there is none", () => {
    const { container } = renderCover({ design: { coverTexture: "NONE" } });
    expect(container.querySelector("[class*='cover-weave']")).toBeNull();
  });

  // A photograph fills the board edge to edge; a weave over it would just be
  // dirt on the picture.
  it("leaves the weave off a photographed cover", () => {
    const { container } = renderCover({
      design: {
        coverTexture: "LINEN",
        coverStyle: "PHOTO",
        coverImageUrl: BLOB,
      },
    });
    expect(container.querySelector("[class*='cover-weave']")).toBeNull();
  });

  it("sets the title in the chosen family, size and position", () => {
    renderCover({
      design: {
        coverTitleFont: "SANS",
        coverTitleSize: "LARGE",
        coverTitlePosition: "BOTTOM",
      },
    });

    const title = screen.getByText("Weeknight Dinners");
    expect(title.className).toContain("font-sans");
    expect(title.className).toContain("text-[11cqw]");
    // The frame doesn't move; the title aligns inside it.
    expect(title.parentElement!.className).toContain("items-end");
  });

  it("falls back to a real treatment for a value outside the vocabulary", () => {
    renderCover({
      // Only reachable from older data or a hand-edited row.
      design: { coverTitleSize: "HUGE" as never },
    });
    expect(screen.getByText("Weeknight Dinners").className).toContain("text-[8.3cqw]");
  });
});

describe("BookCover — framing the photograph", () => {
  it("keeps the chosen point of the picture when it is cropped", () => {
    const { container } = renderCover({
      design: {
        coverStyle: "PHOTO",
        coverImageUrl: BLOB,
        coverFocalX: 0.25,
        coverFocalY: 0.75,
      },
    });

    const img = container.querySelector("img")!;
    expect(img.style.objectPosition).toBe("25% 75%");
  });

  // Zooming about the focal point rather than the centre is what makes the
  // gesture mean "get closer to *this*".
  it("zooms about the focal point, not the middle of the frame", () => {
    const { container } = renderCover({
      design: {
        coverStyle: "PHOTO",
        coverImageUrl: BLOB,
        coverFocalX: 0.2,
        coverFocalY: 0.4,
        coverZoom: 2,
      },
    });

    const img = container.querySelector("img")!;
    expect(img.style.transform).toBe("scale(2)");
    expect(img.style.transformOrigin).toBe("20% 40%");
  });

  // The column is a bare float, so a stored value outside the picture has to
  // render as *something* rather than throwing.
  it("clamps a focal point that fell outside the picture", () => {
    const { container } = renderCover({
      design: {
        coverStyle: "PHOTO",
        coverImageUrl: BLOB,
        coverFocalX: -3,
        coverFocalY: 9,
      },
    });

    expect(container.querySelector("img")!.style.objectPosition).toBe("0% 100%");
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
      design: { coverStyle: "PHOTO", coverImageUrl: BLOB },
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
