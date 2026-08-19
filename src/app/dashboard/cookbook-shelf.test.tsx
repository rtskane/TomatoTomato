// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import CookbookShelf, { coverFor } from "./cookbook-shelf";
import type { CookbookSummary } from "@/server/services/cookbook.service";

afterEach(cleanup);

function summary(overrides: Partial<CookbookSummary> = {}): CookbookSummary {
  return {
    id: "cb1",
    title: "Weeknight Dinners",
    description: "Fast meals.",
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
  // Stable, because a cookbook changing colour between visits would read as a
  // different cookbook.
  it("gives an id the same cover every time", () => {
    expect(coverFor("cb1")).toBe(coverFor("cb1"));
  });

  it("spreads different ids across the covers", () => {
    const ids = ["cba", "cbb", "cbc", "cbd", "cbe"];
    const faces = new Set(ids.map((id) => coverFor(id).face));

    // Consecutive ids differ by one in the sum, so they land on five different
    // covers — the case that matters, since cuids created together are close.
    expect(faces.size).toBe(5);
  });

  it("pairs every cover with an ink meant to be read on it", () => {
    for (const id of ["cba", "cbb", "cbc", "cbd", "cbe"]) {
      const cover = coverFor(id);
      const n = cover.face.slice(-1);
      expect(cover.ink).toBe(`text-book-ink-${n}`);
      expect(cover.face).toBe(`bg-book-cover-${n}`);
    }
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
