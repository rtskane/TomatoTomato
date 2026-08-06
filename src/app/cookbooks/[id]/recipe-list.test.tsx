// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import RecipeList from "./recipe-list";
import type { RecipeSummary } from "@/server/services/cookbook.service";

afterEach(cleanup);

function recipe(overrides: Partial<RecipeSummary> = {}): RecipeSummary {
  return {
    id: "r1",
    title: "Carbonara",
    description: "Rich and fast.",
    servings: 4,
    prepTimeMinutes: 15,
    cookTimeMinutes: 20,
    authorName: "chef_ryan",
    ingredientCount: 5,
    stepCount: 3,
    ...overrides,
  };
}

describe("RecipeList — empty state", () => {
  it("invites an editor to add the first recipe", () => {
    render(<RecipeList recipes={[]} canAddRecipes cookbookId="cb1" />);

    expect(screen.getByText(/no recipes yet/i)).toBeInTheDocument();
    expect(screen.getByText(/add the first one/i)).toBeInTheDocument();
  });

  // Telling a read-only viewer to "add one" would be a dead end.
  it("does not tell a viewer to add one", () => {
    render(<RecipeList recipes={[]} canAddRecipes={false} cookbookId="cb1" />);

    expect(screen.getByText(/no recipes yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/add the first one/i)).not.toBeInTheDocument();
  });
});

describe("RecipeList — populated", () => {
  it("renders one item per recipe", () => {
    render(
      <RecipeList
        recipes={[recipe(), recipe({ id: "r2", title: "Pesto" })]}
        canAddRecipes cookbookId="cb1"
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByText(/no recipes yet/i)).not.toBeInTheDocument();
  });

  it("shows title, description and author", () => {
    render(<RecipeList recipes={[recipe()]} canAddRecipes cookbookId="cb1" />);

    expect(
      screen.getByRole("heading", { name: "Carbonara" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Rich and fast.")).toBeInTheDocument();
    expect(screen.getByText(/by chef_ryan/)).toBeInTheDocument();
  });

  it("shows the full meta line when every field is known", () => {
    render(<RecipeList recipes={[recipe()]} canAddRecipes cookbookId="cb1" />);

    expect(
      screen.getByText(
        /Serves 4 · 15 min prep · 20 min cook · 5 ingredients · 3 steps/,
      ),
    ).toBeInTheDocument();
  });

  // Every one of these columns is nullable, so the meta line has to omit
  // rather than render "Serves null".
  it("omits servings and times that aren't set", () => {
    render(
      <RecipeList
        recipes={[
          recipe({
            servings: null,
            prepTimeMinutes: null,
            cookTimeMinutes: null,
          }),
        ]}
        canAddRecipes cookbookId="cb1"
      />,
    );

    expect(screen.getByText(/5 ingredients · 3 steps/)).toBeInTheDocument();
    expect(screen.queryByText(/Serves/)).not.toBeInTheDocument();
    expect(screen.queryByText(/prep/)).not.toBeInTheDocument();
  });

  it("pluralizes ingredient and step counts", () => {
    render(
      <RecipeList
        recipes={[recipe({ ingredientCount: 1, stepCount: 1 })]}
        canAddRecipes cookbookId="cb1"
      />,
    );

    expect(screen.getByText(/1 ingredient · 1 step/)).toBeInTheDocument();
  });

  it("omits the description block when there is none", () => {
    render(<RecipeList recipes={[recipe({ description: null })]} canAddRecipes cookbookId="cb1" />);

    expect(screen.queryByText("Rich and fast.")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Carbonara" }),
    ).toBeInTheDocument();
  });
});

describe("RecipeList — whole card is clickable", () => {
  it("links each card into the recipe, nested under its cookbook", () => {
    render(<RecipeList recipes={[recipe()]} canAddRecipes cookbookId="cb1" />);

    expect(screen.getByRole("link", { name: "Carbonara" })).toHaveAttribute(
      "href",
      "/cookbooks/cb1/recipes/r1",
    );
  });

  // Same stretched-link reasoning as the dashboard: one link per card, named
  // for the recipe rather than reading out its counts and author too.
  it("exposes exactly one link per card", () => {
    render(
      <RecipeList
        recipes={[recipe(), recipe({ id: "r2", title: "Pesto" })]}
        canAddRecipes
        cookbookId="cb1"
      />,
    );

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links.map((a) => a.textContent)).toEqual(["Carbonara", "Pesto"]);
  });

  it("overlays the link across the card and keeps focus visible", () => {
    render(<RecipeList recipes={[recipe()]} canAddRecipes cookbookId="cb1" />);

    const link = screen.getByRole("link", { name: "Carbonara" });
    expect(link.className).toContain("after:inset-0");
    expect(link.querySelector(".link-pending-overlay")).not.toBeNull();
    const card = screen.getByRole("listitem");
    expect(card.className).toContain("relative");
    expect(card.className).toContain("focus-within:ring-2");
  });

  it("still links for a viewer who cannot add recipes", () => {
    render(
      <RecipeList
        recipes={[recipe()]}
        canAddRecipes={false}
        cookbookId="cb1"
      />,
    );

    expect(screen.getByRole("link", { name: "Carbonara" })).toBeInTheDocument();
  });
});
