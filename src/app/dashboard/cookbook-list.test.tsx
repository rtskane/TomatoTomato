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

describe("CookbookList — empty state", () => {
  it("tells the user there are none and what to do", () => {
    render(<CookbookList cookbooks={[]} />);

    expect(screen.getByText(/no cookbooks yet/i)).toBeInTheDocument();
    expect(screen.getByText(/create one/i)).toBeInTheDocument();
  });

  it("renders no list when empty", () => {
    render(<CookbookList cookbooks={[]} />);

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});

describe("CookbookList — populated", () => {
  it("renders one item per cookbook and drops the empty state", () => {
    render(
      <CookbookList
        cookbooks={[summary(), summary({ id: "cb2", title: "Baking" })]}
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByText(/no cookbooks yet/i)).not.toBeInTheDocument();
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
