// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RecipeCreator from "./recipe-creator";
import type { ImportState } from "./import-actions";
import type { CreateRecipeValues } from "../recipe-form-data";

afterEach(cleanup);

const carbonara: CreateRecipeValues = {
  title: "Weeknight Carbonara",
  description: "The one we make when nobody wants to cook.",
  servings: "2",
  prepTimeMinutes: "5",
  cookTimeMinutes: "15",
  ingredients: [
    { name: "spaghetti", quantity: "200", unit: "g", note: "" },
    { name: "eggs", quantity: "2", unit: "", note: "" },
  ],
  steps: ["Boil the pasta.", "Stir the eggs through off the heat."],
};

/** An import action that succeeds with the recipe above. */
const succeeds = () => vi.fn(async (): Promise<ImportState> => ({ values: carbonara }));

/**
 * An import action that comes back with a message instead — echoing what was
 * submitted, exactly as the real one does.
 */
const fails = (message: string) =>
  vi.fn(async (_state: ImportState, formData: FormData): Promise<ImportState> => ({
    error: message,
    submitted: String(formData.get("url") ?? formData.get("text") ?? ""),
  }));

function renderCreator(overrides: Partial<Parameters<typeof RecipeCreator>[0]> = {}) {
  return render(
    <RecipeCreator
      cookbookId="cb1"
      saveAction={vi.fn()}
      importTextAction={succeeds()}
      importUrlAction={succeeds()}
      {...overrides}
    />,
  );
}

describe("choosing how to add a recipe", () => {
  it("offers every way in, and promises a look before saving", () => {
    renderCreator();

    expect(screen.getByRole("button", { name: /fill in the form/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /paste a recipe/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /from a link/i })).toBeInTheDocument();
    expect(screen.getByText(/check it over before/i)).toBeInTheDocument();
  });

  it("goes straight to an empty form for someone who wants to type", async () => {
    const user = userEvent.setup();
    renderCreator();

    await user.click(screen.getByRole("button", { name: /fill in the form/i }));

    expect(screen.getByLabelText("Title")).toHaveValue("");
    // No import happened, so there is nothing to review — just a way back.
    expect(screen.queryByText(/what we made of it/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /choose a different way/i }),
    ).toBeInTheDocument();
  });
});

describe("importing", () => {
  it("fills the form in from pasted text and asks for a look", async () => {
    const user = userEvent.setup();
    renderCreator();

    await user.click(screen.getByRole("button", { name: /paste a recipe/i }));
    await user.type(screen.getByRole("textbox"), "Carbonara");
    await user.click(screen.getByRole("button", { name: /read it/i }));

    // The form is now seeded with what came back.
    await waitFor(() =>
      expect(screen.getByLabelText("Title")).toHaveValue("Weeknight Carbonara"),
    );
    expect(screen.getByLabelText("Serves")).toHaveValue("2");
    expect(screen.getByText("200 g spaghetti")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Boil the pasta.")).toBeInTheDocument();

    // And it is explicitly a draft, not a saved recipe.
    expect(screen.getByText(/what we made of it/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing is saved until you say so/i)).toBeInTheDocument();
  });

  it("fills the form in from a link", async () => {
    const user = userEvent.setup();
    renderCreator();

    await user.click(screen.getByRole("button", { name: /from a link/i }));
    await user.type(screen.getByRole("textbox"), "https://example.com/recipe");
    await user.click(screen.getByRole("button", { name: /read it/i }));

    await waitFor(() =>
      expect(screen.getByLabelText("Title")).toHaveValue("Weeknight Carbonara"),
    );
  });

  it("sends what was pasted to the importer", async () => {
    const user = userEvent.setup();
    const importTextAction = vi.fn(
      async (_state: ImportState, _formData: FormData): Promise<ImportState> => ({
        values: carbonara,
      }),
    );
    renderCreator({ importTextAction });

    await user.click(screen.getByRole("button", { name: /paste a recipe/i }));
    await user.type(screen.getByRole("textbox"), "Carbonara");
    await user.click(screen.getByRole("button", { name: /read it/i }));

    await waitFor(() => expect(importTextAction).toHaveBeenCalled());
    const formData = importTextAction.mock.calls[0][1];
    expect(formData.get("text")).toBe("Carbonara");
  });

  // Someone who gives up waiting and starts typing by hand must not have an
  // import land on top of what they typed.
  it("drops an import that finishes after the author has moved on", async () => {
    const user = userEvent.setup();
    let finish: (state: ImportState) => void = () => {};
    const importTextAction = vi.fn(
      () => new Promise<ImportState>((resolve) => (finish = resolve)),
    );
    renderCreator({ importTextAction });

    await user.click(screen.getByRole("button", { name: /paste a recipe/i }));
    await user.type(screen.getByRole("textbox"), "Carbonara");
    await user.click(screen.getByRole("button", { name: /read it/i }));
    await waitFor(() => expect(importTextAction).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: /^back$/i }));
    await user.click(screen.getByRole("button", { name: /fill in the form/i }));
    await user.type(screen.getByLabelText("Title"), "My own");

    await act(async () => finish({ values: carbonara }));

    expect(screen.getByLabelText("Title")).toHaveValue("My own");
    expect(screen.queryByText(/what we made of it/i)).not.toBeInTheDocument();
  });

  it("stays on the panel when a later import fails after an earlier one worked", async () => {
    const user = userEvent.setup();
    const importUrlAction = vi
      .fn()
      .mockResolvedValueOnce({ values: carbonara })
      .mockResolvedValueOnce({ error: "That site won't let us read the page." });
    renderCreator({ importUrlAction });

    await user.click(screen.getByRole("button", { name: /from a link/i }));
    await user.type(screen.getByRole("textbox"), "https://example.com/a");
    await user.click(screen.getByRole("button", { name: /read it/i }));
    await waitFor(() => expect(screen.getByLabelText("Title")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /start over/i }));
    await user.click(screen.getByRole("button", { name: /from a link/i }));
    await user.type(screen.getByRole("textbox"), "https://example.com/b");
    await user.click(screen.getByRole("button", { name: /read it/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
  });

  // A failed import must leave the user where they were, with what they typed
  // still in front of them — sending them to an empty form would cost them the
  // paste and tell them nothing.
  it("stays put and explains when an import fails", async () => {
    const user = userEvent.setup();
    renderCreator({
      importUrlAction: fails("That site won't let us read the page."),
    });

    await user.click(screen.getByRole("button", { name: /from a link/i }));
    await user.type(screen.getByRole("textbox"), "https://www.allrecipes.com/x");
    await user.click(screen.getByRole("button", { name: /read it/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/won't let us read/i),
    );
    // Still on the link panel, not thrown into the form.
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
  });

  // React empties an uncontrolled field once the action resolves. Without the
  // echo that re-seeds it, a failed import would swallow the recipe someone
  // had just pasted — at the exact moment they need it most.
  it("keeps what was typed when an import fails", async () => {
    const user = userEvent.setup();
    renderCreator({ importTextAction: fails("We couldn't make a recipe out of that.") });

    const pasted = "Nan's shortbread\n225g butter\nCream it all together.";
    await user.click(screen.getByRole("button", { name: /paste a recipe/i }));
    await user.type(screen.getByRole("textbox"), pasted);
    await user.click(screen.getByRole("button", { name: /read it/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("textbox")).toHaveValue(pasted);
  });

  it("keeps a typed link when the site refuses us", async () => {
    const user = userEvent.setup();
    renderCreator({ importUrlAction: fails("That site won't let us read the page.") });

    await user.click(screen.getByRole("button", { name: /from a link/i }));
    await user.type(screen.getByRole("textbox"), "https://example.com/recipe");
    await user.click(screen.getByRole("button", { name: /read it/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("textbox")).toHaveValue("https://example.com/recipe");
  });

  it("lets someone back out to try a different way", async () => {
    const user = userEvent.setup();
    renderCreator();

    await user.click(screen.getByRole("button", { name: /paste a recipe/i }));
    await user.click(screen.getByRole("button", { name: /^back$/i }));

    expect(screen.getByRole("button", { name: /from a link/i })).toBeInTheDocument();
  });

  // The form seeds its ingredient and step lists once, when it mounts, so
  // starting over has to leave none of the previous import's rows behind.
  it("starting over leaves nothing of the last import behind", async () => {
    const user = userEvent.setup();
    renderCreator();

    await user.click(screen.getByRole("button", { name: /paste a recipe/i }));
    await user.type(screen.getByRole("textbox"), "Carbonara");
    await user.click(screen.getByRole("button", { name: /read it/i }));

    await waitFor(() =>
      expect(screen.getByText("200 g spaghetti")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /start over/i }));
    await user.click(screen.getByRole("button", { name: /fill in the form/i }));

    expect(screen.getByLabelText("Title")).toHaveValue("");
    expect(screen.queryByText("200 g spaghetti")).not.toBeInTheDocument();
  });
});
