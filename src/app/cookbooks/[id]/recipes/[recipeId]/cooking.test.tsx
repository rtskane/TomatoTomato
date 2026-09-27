// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RecipeArticle from "./recipe-article";
import { progressKey, PROGRESS_TTL_MS } from "@/lib/cooking-progress";
import type { RecipeDetail } from "@/server/services/recipe-detail.service";

// Cooking mode as it's used: through the recipe page, not its parts one by
// one, since what matters is that the stepper, the list and the steps share
// the same state.

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  // Delete the stubbed Wake Lock API, if a test added one.
  delete (navigator as { wakeLock?: unknown }).wakeLock;
});

function detail(overrides: Partial<RecipeDetail> = {}): RecipeDetail {
  return {
    id: "r1",
    title: "Pancakes",
    description: null,
    servings: 4,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    totalTimeMinutes: null,
    coverImageUrl: null,
    authorName: "chef_ryan",
    canModify: false,
    cookbook: { id: "cb1", title: "Breakfasts" },
    ingredients: [
      { id: "i1", name: "flour", quantity: 1, unit: "cup", note: null },
      { id: "i2", name: "salt", quantity: 0.25, unit: "tsp", note: null },
      { id: "i3", name: "butter", quantity: null, unit: "", note: "for the pan" },
    ],
    steps: [
      { id: "s1", instruction: "Whisk everything." },
      { id: "s2", instruction: "Fry in butter." },
    ],
    ...overrides,
  };
}

const ingredients = () =>
  within(screen.getByRole("heading", { name: "Ingredients" }).parentElement!);

describe("scaling", () => {
  it("prints stored fractions as fractions", () => {
    render(<RecipeArticle recipe={detail()} />);
    expect(ingredients().getByText(/¼ tsp salt/)).toBeInTheDocument();
  });

  it("scales every amount with the servings", async () => {
    const user = userEvent.setup();
    render(<RecipeArticle recipe={detail()} />);

    await user.click(screen.getByRole("button", { name: "More servings" }));
    await user.click(screen.getByRole("button", { name: "More servings" }));

    expect(screen.getByRole("status")).toHaveTextContent("6");
    expect(ingredients().getByText(/1½ cup flour/)).toBeInTheDocument();
    expect(ingredients().getByText(/⅜ tsp salt/)).toBeInTheDocument();
    // Nothing to scale on a line with no amount.
    expect(ingredients().getByText(/^butter/)).toBeInTheDocument();
  });

  it("goes back to the recipe's own servings", async () => {
    const user = userEvent.setup();
    render(<RecipeArticle recipe={detail()} />);

    await user.click(screen.getByRole("button", { name: "Fewer servings" }));
    expect(ingredients().getByText(/¾ cup flour/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset to 4" }));
    expect(ingredients().getByText(/^1 cup flour/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset to 4" })).toBeNull();
  });

  it("stops at one serving", async () => {
    const user = userEvent.setup();
    render(<RecipeArticle recipe={detail({ servings: 1 })} />);
    expect(screen.getByRole("button", { name: "Fewer servings" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "More servings" }));
    expect(screen.getByRole("button", { name: "Fewer servings" })).toBeEnabled();
  });

  // Nothing to step from, so it offers multiples instead.
  it("offers multiples for a recipe with no servings", async () => {
    const user = userEvent.setup();
    render(<RecipeArticle recipe={detail({ servings: null })} />);

    expect(screen.queryByRole("button", { name: "More servings" })).toBeNull();
    expect(screen.getByRole("button", { name: "1×" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "2×" }));

    expect(screen.getByRole("button", { name: "2×" })).toHaveAttribute("aria-pressed", "true");
    expect(ingredients().getByText(/^2 cup flour/)).toBeInTheDocument();
    expect(ingredients().getByText(/½ tsp salt/)).toBeInTheDocument();
  });

  // A stepper that changes nothing would be a lie.
  it("shows plain servings when no ingredient has an amount", () => {
    render(
      <RecipeArticle
        recipe={detail({
          ingredients: [{ id: "i1", name: "salt", quantity: null, unit: "", note: null }],
        })}
      />,
    );

    expect(screen.getByText("Serves")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More servings" })).toBeNull();
  });

  // "Add 200 g of flour" in a step is just text.
  it("says the method isn't scaled, only while it is", async () => {
    const user = userEvent.setup();
    render(<RecipeArticle recipe={detail()} />);

    expect(screen.queryByText(/aren’t scaled/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "More servings" }));
    expect(screen.getByText(/aren’t scaled/)).toBeInTheDocument();
  });
});

describe("ticking things off", () => {
  it("ticks an ingredient by tapping its line", async () => {
    const user = userEvent.setup();
    render(<RecipeArticle recipe={detail()} />);

    await user.click(ingredients().getByText(/1 cup flour/));

    expect(screen.getByRole("checkbox", { name: /1 cup flour/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /salt/ })).not.toBeChecked();
  });

  it("ticks a step, turning its numeral into a check", async () => {
    const user = userEvent.setup();
    render(<RecipeArticle recipe={detail()} />);

    await user.click(screen.getByText("Whisk everything."));

    expect(screen.getByRole("checkbox", { name: "Whisk everything." })).toBeChecked();
    expect(screen.getByText("✓")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("clears the ticks, but not the scale", async () => {
    const user = userEvent.setup();
    render(<RecipeArticle recipe={detail()} />);
    expect(screen.queryByRole("button", { name: "Clear ticks" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "More servings" }));
    await user.click(screen.getByText("Whisk everything."));
    await user.click(screen.getByRole("button", { name: "Clear ticks" }));

    expect(screen.getByRole("checkbox", { name: "Whisk everything." })).not.toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent("5");
  });
});

describe("remembering progress", () => {
  it("picks up where this device left off", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<RecipeArticle recipe={detail()} />);
    await user.click(screen.getByText("Fry in butter."));
    await user.click(screen.getByRole("button", { name: "More servings" }));
    unmount();

    render(<RecipeArticle recipe={detail()} />);

    expect(screen.getByRole("checkbox", { name: "Fry in butter." })).toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent("5");
  });

  it("keeps each recipe's progress to itself", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<RecipeArticle recipe={detail()} />);
    await user.click(screen.getByText("Fry in butter."));
    unmount();

    render(<RecipeArticle recipe={detail({ id: "r2" })} />);

    expect(screen.getByRole("checkbox", { name: "Fry in butter." })).not.toBeChecked();
  });

  // Tomorrow's dinner starts clean.
  it("forgets it after the TTL", () => {
    localStorage.setItem(
      progressKey("r1"),
      JSON.stringify({
        savedAt: Date.now() - PROGRESS_TTL_MS - 1,
        factor: 2,
        ingredients: [],
        steps: ["s1"],
      }),
    );

    render(<RecipeArticle recipe={detail()} />);

    expect(screen.getByRole("checkbox", { name: "Whisk everything." })).not.toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent("4");
  });

  // Private browsing and blocked site data make localStorage throw.
  it("still works for the visit when storage is unavailable", async () => {
    const user = userEvent.setup();
    const broken = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      clear: () => {},
    };
    vi.stubGlobal("localStorage", broken);
    render(<RecipeArticle recipe={detail({ id: "r-private" })} />);

    await user.click(screen.getByText("Whisk everything."));

    expect(screen.getByRole("checkbox", { name: "Whisk everything." })).toBeChecked();
  });
});

describe("keep screen on", () => {
  function stubWakeLock(request: () => Promise<WakeLockSentinel>) {
    Object.defineProperty(navigator, "wakeLock", {
      value: { request: vi.fn(request) },
      configurable: true,
    });
    return (navigator as unknown as { wakeLock: { request: ReturnType<typeof vi.fn> } })
      .wakeLock.request;
  }

  function sentinel() {
    const s = { released: false, release: vi.fn(async () => { s.released = true; }) };
    return s as unknown as WakeLockSentinel & { release: ReturnType<typeof vi.fn> };
  }

  // Shown and useless would be worse than absent.
  it("isn't offered where the browser can't do it", () => {
    render(<RecipeArticle recipe={detail()} />);
    expect(screen.queryByRole("button", { name: "Keep screen on" })).toBeNull();
  });

  it("holds the lock while on, and lets go when turned off", async () => {
    const user = userEvent.setup();
    const lock = sentinel();
    const request = stubWakeLock(async () => lock);
    render(<RecipeArticle recipe={detail()} />);
    const toggle = screen.getByRole("button", { name: "Keep screen on" });

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(request).toHaveBeenCalledWith("screen");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(lock.release).toHaveBeenCalled();
  });

  // The browser drops the lock when the page is hidden and never takes it back.
  it("asks again on coming back to the page", async () => {
    const user = userEvent.setup();
    const first = sentinel();
    const request = stubWakeLock(async () => first);
    render(<RecipeArticle recipe={detail()} />);
    await user.click(screen.getByRole("button", { name: "Keep screen on" }));
    expect(request).toHaveBeenCalledTimes(1);

    // What the browser does on its own when the phone locks.
    (first as unknown as { released: boolean }).released = true;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(request).toHaveBeenCalledTimes(2);
  });

  it("says so, and turns back off, when the browser refuses", async () => {
    const user = userEvent.setup();
    stubWakeLock(async () => {
      throw new DOMException("Battery low", "NotAllowedError");
    });
    render(<RecipeArticle recipe={detail()} />);
    const toggle = screen.getByRole("button", { name: "Keep screen on" });

    await user.click(toggle);

    expect(await screen.findByText(/wouldn’t allow it/)).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });
});
