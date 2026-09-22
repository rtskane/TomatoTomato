// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import RecipeArticle, { articleWidth } from "./recipe-article";
import type { RecipeDetail } from "@/server/services/recipe-detail.service";

afterEach(cleanup);

function detail(overrides: Partial<RecipeDetail> = {}): RecipeDetail {
  return {
    id: "r1",
    title: "Carbonara",
    description: "Rich and fast.",
    servings: 4,
    prepTimeMinutes: 15,
    cookTimeMinutes: 30,
    coverImageUrl: null,
    totalTimeMinutes: 45,
    authorName: "chef_ryan",
    canModify: false,
    cookbook: { id: "cb1", title: "Weeknight Dinners" },
    ingredients: [
      { id: "i1", name: "spaghetti", quantity: "200", unit: "g", note: null },
      { id: "i2", name: "egg", quantity: "2", unit: "", note: "yolks only" },
    ],
    steps: [
      { id: "s1", instruction: "Boil the pasta." },
      { id: "s2", instruction: "Mix the eggs." },
    ],
    ...overrides,
  };
}

describe("RecipeArticle — masthead", () => {
  it("shows the title, byline and description", () => {
    render(<RecipeArticle recipe={detail()} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Carbonara" }),
    ).toBeInTheDocument();
    expect(screen.getByText("By chef_ryan")).toBeInTheDocument();
    expect(screen.getByText("Rich and fast.")).toBeInTheDocument();
  });

  it("omits the description when there is none", () => {
    render(<RecipeArticle recipe={detail({ description: null })} />);

    expect(screen.queryByText("Rich and fast.")).not.toBeInTheDocument();
  });
});

describe("RecipeArticle — stats", () => {
  it("renders serves, prep, cook and total", () => {
    render(<RecipeArticle recipe={detail()} />);

    expect(screen.getByText("Serves")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("15 min")).toBeInTheDocument();
    expect(screen.getByText("30 min")).toBeInTheDocument();
    expect(screen.getByText("45 min")).toBeInTheDocument();
  });

  // Total repeating a lone prep or cook value is noise.
  it("hides total when only one of prep or cook is known", () => {
    render(
      <RecipeArticle
        recipe={detail({
          prepTimeMinutes: 15,
          cookTimeMinutes: null,
          coverImageUrl: null,
          totalTimeMinutes: 15,
        })}
      />,
    );

    expect(screen.getByText("Prep")).toBeInTheDocument();
    expect(screen.queryByText("Total")).not.toBeInTheDocument();
    expect(screen.queryByText("Cook")).not.toBeInTheDocument();
  });

  it("drops the whole strip when nothing is known", () => {
    render(
      <RecipeArticle
        recipe={detail({
          servings: null,
          prepTimeMinutes: null,
          cookTimeMinutes: null,
          coverImageUrl: null,
          totalTimeMinutes: null,
        })}
      />,
    );

    expect(screen.queryByText("Serves")).not.toBeInTheDocument();
    expect(screen.queryByText("Prep")).not.toBeInTheDocument();
  });

  it("formats long durations in hours", () => {
    render(
      <RecipeArticle
        recipe={detail({ cookTimeMinutes: 90, totalTimeMinutes: 105 })}
      />,
    );

    expect(screen.getByText("1 hr 30 min")).toBeInTheDocument();
    expect(screen.getByText("1 hr 45 min")).toBeInTheDocument();
  });
});

describe("RecipeArticle — ingredients", () => {
  it("renders each ingredient the way a recipe reads", () => {
    render(<RecipeArticle recipe={detail()} />);

    const list = screen.getByRole("heading", { name: "Ingredients" })
      .parentElement as HTMLElement;
    expect(within(list).getByText(/200 g spaghetti/)).toBeInTheDocument();
    expect(within(list).getByText(/2 egg/)).toBeInTheDocument();
  });

  it("shows a note beside the ingredient", () => {
    render(<RecipeArticle recipe={detail()} />);

    expect(screen.getByText(/yolks only/)).toBeInTheDocument();
  });

  it("renders a bare name when there's no quantity", () => {
    render(
      <RecipeArticle
        recipe={detail({
          ingredients: [
            { id: "i1", name: "salt", quantity: "", unit: "", note: null },
          ],
        })}
      />,
    );

    expect(screen.getByText("salt")).toBeInTheDocument();
  });
});

describe("RecipeArticle — method", () => {
  it("renders the steps in order", () => {
    render(<RecipeArticle recipe={detail()} />);

    const method = screen.getByRole("heading", { name: "Method" })
      .parentElement as HTMLElement;
    const steps = within(method).getAllByRole("listitem");
    expect(steps).toHaveLength(2);
    expect(steps[0]).toHaveTextContent("Boil the pasta.");
    expect(steps[1]).toHaveTextContent("Mix the eggs.");
  });

  // The numerals are decorative — an <ol> already conveys order, so repeating
  // it to a screen reader would just be noise.
  it("hides the decorative step numerals from assistive tech", () => {
    const { container } = render(<RecipeArticle recipe={detail()} />);

    const hidden = container.querySelectorAll('[aria-hidden="true"]');
    expect(hidden.length).toBe(2);
    expect(hidden[0]).toHaveTextContent("1");
  });

  it("preserves line breaks within a step", () => {
    render(
      <RecipeArticle
        recipe={detail({
          steps: [{ id: "s1", instruction: "Line one\nLine two" }],
        })}
      />,
    );

    expect(screen.getByText(/Line one/)).toHaveClass("whitespace-pre-wrap");
  });
});

describe("RecipeArticle — photo", () => {
  const BLOB = "https://abc123.public.blob.vercel-storage.com/recipe-photos/dinner.jpg";

  it("shows the photo beside the title, loaded first", () => {
    const { container } = render(
      <RecipeArticle recipe={detail({ coverImageUrl: BLOB })} />,
    );

    const img = container.querySelector("header img")!;
    expect(img).not.toBeNull();
    expect(img.getAttribute("src")).toContain(encodeURIComponent(BLOB));
    // It is the largest thing on the page, so it mustn't wait to lazy-load.
    expect(img).toHaveAttribute("loading", "eager");
    expect(img).toHaveAttribute("fetchpriority", "high");
  });

  // The heading beside it already names the dish.
  it("doesn't announce the photo as the title a second time", () => {
    const { container } = render(
      <RecipeArticle recipe={detail({ coverImageUrl: BLOB })} />,
    );
    expect(container.querySelector("header img")).toHaveAttribute("alt", "");
  });

  it("has no image at all when there's no photo", () => {
    const { container } = render(<RecipeArticle recipe={detail()} />);
    expect(container.querySelector("img")).toBeNull();
  });

  // A wide page with nothing in its second column is just an empty margin.
  it("widens the page only for a recipe with a photo", () => {
    expect(articleWidth({ coverImageUrl: BLOB })).toBe("max-w-5xl");
    expect(articleWidth({ coverImageUrl: null })).toBe("max-w-3xl");
  });
});

describe("RecipeArticle — editing", () => {
  // `canModify` is the same rule the update and delete actions enforce, so the
  // link can never offer something the server would refuse.
  it("offers Edit to someone who may change the recipe, beside the byline", () => {
    render(<RecipeArticle recipe={detail({ canModify: true })} />);

    const edit = screen.getByRole("link", { name: "Edit" });
    expect(edit).toHaveAttribute("href", "/cookbooks/cb1/recipes/r1/edit");
    // Beside a photo, out at the column's edge, it floated free of the title.
    expect(edit.parentElement).toHaveTextContent("By chef_ryan");
  });

  it("offers nothing to someone who may not", () => {
    render(<RecipeArticle recipe={detail({ canModify: false })} />);
    expect(screen.queryByRole("link", { name: "Edit" })).toBeNull();
  });
});
