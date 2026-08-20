// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import CookbookShelf from "./cookbook-shelf";
import { coverDesign } from "@/components/book-cover";
import type { CookbookSummary } from "@/server/services/cookbook.service";

afterEach(cleanup);

function summary(overrides: Partial<CookbookSummary> = {}): CookbookSummary {
  return {
    id: "cb1",
    title: "Weeknight Dinners",
    description: "Fast meals.",
    design: coverDesign(1),
    role: "OWNER",
    recipeCount: 3,
    memberCount: 2,
    ...overrides,
  };
}

describe("CookbookShelf — the shelf", () => {
  it("renders one book per cookbook", () => {
    render(
      <CookbookShelf
        cookbooks={[summary(), summary({ id: "cb2", title: "Baking" })]}
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("lays the books out two to a row, three on a wide screen", () => {
    render(<CookbookShelf cookbooks={[summary()]} />);

    const shelf = screen.getByRole("list");
    expect(shelf.className).toContain("grid-cols-2");
    expect(shelf.className).toContain("lg:grid-cols-3");
  });

  it("names the cookbook under the book as well as on it", () => {
    render(<CookbookShelf cookbooks={[summary()]} />);

    // Twice: once printed on the cover, once as the shelf label beneath it.
    expect(screen.getAllByText("Weeknight Dinners")).toHaveLength(2);
  });

  it("shows the counts under the book", () => {
    render(<CookbookShelf cookbooks={[summary()]} />);
    expect(screen.getByText(/3 recipes · 2 members/)).toBeInTheDocument();
  });

  it("leaves the description off the shelf", () => {
    render(<CookbookShelf cookbooks={[summary()]} />);
    expect(screen.queryByText("Fast meals.")).not.toBeInTheDocument();
  });
});

describe("CookbookShelf — covers", () => {
  // The palette itself is tested in lib/book-covers.test.ts, and the book face
  // in components/book-cover.test.tsx. What matters here is that the shelf
  // paints the colour the cookbook was given rather than one of its own.
  it("paints each book in its own chosen colour", () => {
    const { container } = render(
      <CookbookShelf
        cookbooks={[
          summary({ design: coverDesign(2) }),
          summary({ id: "cb2", title: "Baking", design: coverDesign(7) }),
        ]}
      />,
    );

    const faces = [...container.querySelectorAll("[aria-hidden] > div")];
    expect(faces[0]!.className).toContain("bg-book-cover-2");
    expect(faces[1]!.className).toContain("bg-book-cover-7");
  });
});

describe("CookbookShelf — the whole book is clickable", () => {
  it("links to the cookbook", () => {
    render(<CookbookShelf cookbooks={[summary()]} />);

    expect(
      screen.getByRole("link", { name: "Weeknight Dinners" }),
    ).toHaveAttribute("href", "/cookbooks/cb1");
  });

  // The title is printed twice, so the cover is hidden from assistive tech —
  // otherwise every book announces its name, then announces it again.
  it("exposes one link per book, named once", () => {
    render(
      <CookbookShelf
        cookbooks={[summary(), summary({ id: "cb2", title: "Baking" })]}
      />,
    );

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links.map((a) => a.textContent)).toEqual([
      "Weeknight Dinners",
      "Baking",
    ]);
  });

  it("hides the cover from assistive tech", () => {
    const { container } = render(<CookbookShelf cookbooks={[summary()]} />);

    const face = container.querySelector("[aria-hidden]");
    expect(face).not.toBeNull();
    expect(face!.textContent).toBe("Weeknight Dinners");
  });

  it("overlays the link across the book, anchored to a positioned item", () => {
    render(<CookbookShelf cookbooks={[summary()]} />);

    const link = screen.getByRole("link", { name: "Weeknight Dinners" });
    expect(link.className).toContain("after:absolute");
    expect(link.className).toContain("after:inset-0");
    // Without a positioned ancestor the overlay would escape the book.
    expect(screen.getByRole("listitem").className).toContain("relative");
    // Pending feedback while navigation is in flight (useLinkStatus).
    expect(link.querySelector(".link-pending-overlay")).not.toBeNull();
  });

  it("keeps a visible focus indicator on the book", () => {
    render(<CookbookShelf cookbooks={[summary()]} />);

    expect(screen.getByRole("listitem").className).toContain(
      "focus-within:ring-2",
    );
  });
});

describe("CookbookShelf — cover images", () => {
  const BLOB = "https://abc123.public.blob.vercel-storage.com/cookbook-covers/a.jpg";

  it("prints the title on the cover when there is no image", () => {
    render(<CookbookShelf cookbooks={[summary()]} />);

    // Once on the cover, once on the shelf label below it.
    expect(screen.getAllByText("Weeknight Dinners")).toHaveLength(2);
  });

  it("shows the image instead of the printed title when there is one", () => {
    render(
      <CookbookShelf
        cookbooks={[summary({ design: coverDesign(1, { coverImageUrl: BLOB, coverStyle: "PHOTO" }) })]}
      />,
    );

    const img = screen.getByRole("presentation", { hidden: true });
    expect(img.tagName).toBe("IMG");
    // The name is now only the label below, so it appears once.
    expect(screen.getAllByText("Weeknight Dinners")).toHaveLength(1);
  });

  // The book keeps its shape: an image swaps for the frame, not for the book.
  it("keeps naming the cookbook underneath either way", () => {
    render(
      <CookbookShelf
        cookbooks={[summary({ design: coverDesign(1, { coverImageUrl: BLOB, coverStyle: "PHOTO" }) })]}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Weeknight Dinners" }),
    ).toHaveAttribute("href", "/cookbooks/cb1");
  });
});
