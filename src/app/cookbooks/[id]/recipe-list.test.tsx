// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
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
    coverImageUrl: null,
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
            coverImageUrl: null,
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

describe("RecipeList — with photos", () => {
  const BLOB = "https://abc123.public.blob.vercel-storage.com/recipe-photos/dinner.jpg";

  it("shows each recipe's photo once any recipe has one", () => {
    const { container } = render(
      <RecipeList
        recipes={[recipe({ id: "r1", coverImageUrl: BLOB })]}
        canAddRecipes
        cookbookId="cb1"
      />,
    );

    const img = container.querySelector("li img")!;
    expect(img.getAttribute("src")).toContain(encodeURIComponent(BLOB));
    // The title under it names the dish, and the link is the card's label.
    expect(img).toHaveAttribute("alt", "");
  });

  // The rows only line up if every card has something where the photo goes.
  it("gives a recipe without a photo a tile in its place, hidden from assistive tech", () => {
    const { container } = render(
      <RecipeList
        recipes={[
          recipe({ id: "r1", coverImageUrl: BLOB }),
          recipe({ id: "r2", title: "tomato soup", coverImageUrl: null }),
        ]}
        canAddRecipes
        cookbookId="cb1"
      />,
    );

    const tile = within(container.querySelectorAll("li")[1]).getByText("T");
    expect(tile).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps the title, author and detail line under the photo", () => {
    render(
      <RecipeList
        recipes={[recipe({ coverImageUrl: BLOB })]}
        canAddRecipes
        cookbookId="cb1"
      />,
    );

    expect(screen.getByRole("heading", { name: "Carbonara" })).toBeInTheDocument();
    expect(screen.getByText("by chef_ryan")).toBeInTheDocument();
    expect(screen.getByText(/Serves 4/)).toBeInTheDocument();
  });

  it("still makes the whole card one link into the recipe", () => {
    render(
      <RecipeList
        recipes={[recipe({ coverImageUrl: BLOB })]}
        canAddRecipes
        cookbookId="cb1"
      />,
    );

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/cookbooks/cb1/recipes/r1");
    expect(links[0]).toHaveAccessibleName(/Carbonara/);
  });

  // A grid of empty tiles would be all placeholder and no recipe.
  it("keeps the text cards when no recipe has a photo", () => {
    const { container } = render(
      <RecipeList recipes={[recipe()]} canAddRecipes cookbookId="cb1" />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("Rich and fast.")).toBeInTheDocument();
  });
});
