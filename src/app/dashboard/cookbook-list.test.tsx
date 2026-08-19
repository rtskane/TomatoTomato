// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import CookbookList from "./cookbook-list";
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

describe("CookbookList — populated", () => {
  it("renders one item per cookbook", () => {
    render(
      <CookbookList
        cookbooks={[summary(), summary({ id: "cb2", title: "Baking" })]}
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("shows the title and description", () => {
    render(<CookbookList cookbooks={[summary()]} />);

    expect(
      screen.getByRole("heading", { name: "Weeknight Dinners" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Fast meals.")).toBeInTheDocument();
  });

  it("omits the description block when there is none", () => {
    render(<CookbookList cookbooks={[summary({ description: null })]} />);

    expect(screen.queryByText("Fast meals.")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Weeknight Dinners" }),
    ).toBeInTheDocument();
  });

  it("pluralizes the counts", () => {
    render(<CookbookList cookbooks={[summary()]} />);
    expect(screen.getByText(/3 recipes · 2 members/)).toBeInTheDocument();
  });

  it("uses singular forms for a count of one", () => {
    render(
      <CookbookList
        cookbooks={[summary({ recipeCount: 1, memberCount: 1 })]}
      />,
    );
    expect(screen.getByText(/1 recipe · 1 member/)).toBeInTheDocument();
  });

  it("handles zero recipes", () => {
    render(<CookbookList cookbooks={[summary({ recipeCount: 0 })]} />);
    expect(screen.getByText(/0 recipes/)).toBeInTheDocument();
  });

  it("names the viewer's role only when they aren't the owner", () => {
    render(<CookbookList cookbooks={[summary({ role: "EDITOR" })]} />);
    expect(screen.getByText(/editor/)).toBeInTheDocument();

    cleanup();
    render(<CookbookList cookbooks={[summary({ role: "OWNER" })]} />);
    expect(screen.queryByText(/owner/i)).not.toBeInTheDocument();
  });
});

describe("CookbookList — whole card is clickable", () => {
  it("links to the cookbook", () => {
    render(<CookbookList cookbooks={[summary()]} />);

    expect(
      screen.getByRole("link", { name: "Weeknight Dinners" }),
    ).toHaveAttribute("href", "/cookbooks/cb1");
  });

  // The stretched-link pattern: the card is one click target, but assistive
  // tech still sees a single link named for the cookbook, not a giant link
  // that reads out the description and counts as well.
  it("exposes exactly one link per card, named for the cookbook", () => {
    render(
      <CookbookList
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

  it("overlays the link across the card, anchored to a positioned item", () => {
    render(<CookbookList cookbooks={[summary()]} />);

    const link = screen.getByRole("link", { name: "Weeknight Dinners" });
    expect(link.className).toContain("after:absolute");
    expect(link.className).toContain("after:inset-0");
    // Without a positioned ancestor the overlay would escape the card.
    expect(screen.getByRole("listitem").className).toContain("relative");
    // Pending feedback while navigation is in flight (useLinkStatus).
    expect(link.querySelector(".link-pending-overlay")).not.toBeNull();
  });

  // Removing the link's own outline is only acceptable because the card shows
  // a focus ring instead — otherwise keyboard users lose their place.
  it("keeps a visible focus indicator on the card", () => {
    render(<CookbookList cookbooks={[summary()]} />);

    expect(screen.getByRole("listitem").className).toContain(
      "focus-within:ring-2",
    );
  });
});
