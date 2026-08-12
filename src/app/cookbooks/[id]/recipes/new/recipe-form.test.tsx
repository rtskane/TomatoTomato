// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RecipeForm from "./recipe-form";
import type { CreateRecipeState } from "../recipe-form-data";

afterEach(cleanup);

type FormAction = (
  state: CreateRecipeState,
  formData: FormData,
) => Promise<CreateRecipeState>;

const noop = () => vi.fn<FormAction>(async () => ({}));

async function addIngredient(
  name: string,
  { quantity = "", unit = "" }: { quantity?: string; unit?: string } = {},
) {
  if (quantity) await userEvent.type(screen.getByLabelText("Quantity"), quantity);
  if (unit) await userEvent.type(screen.getByLabelText("Unit"), unit);
  await userEvent.type(screen.getByLabelText("Ingredient"), name);
  await userEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);
}

async function addStep(instruction: string) {
  await userEvent.type(screen.getByLabelText("Next step"), instruction);
  await userEvent.click(screen.getAllByRole("button", { name: "Add" })[1]);
}

describe("RecipeForm — composer", () => {
  it("starts with no committed rows", () => {
    render(<RecipeForm action={noop()} cookbookId="cb1" />);

    expect(screen.getByLabelText("Ingredient")).toHaveValue("");
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("won't add an ingredient without a name", async () => {
    render(<RecipeForm action={noop()} cookbookId="cb1" />);

    await userEvent.type(screen.getByLabelText("Quantity"), "200");

    expect(screen.getAllByRole("button", { name: "Add" })[0]).toBeDisabled();
  });

  it("commits an ingredient and clears the composer", async () => {
    render(<RecipeForm action={noop()} cookbookId="cb1" />);

    await addIngredient("spaghetti", { quantity: "200", unit: "g" });

    expect(screen.getByText("200 g spaghetti")).toBeInTheDocument();
    expect(screen.getByLabelText("Ingredient")).toHaveValue("");
    expect(screen.getByLabelText("Quantity")).toHaveValue("");
  });

  it("commits an ingredient on Enter", async () => {
    render(<RecipeForm action={noop()} cookbookId="cb1" />);

    await userEvent.type(screen.getByLabelText("Ingredient"), "salt{Enter}");

    expect(screen.getByText("salt")).toBeInTheDocument();
    expect(screen.getByLabelText("Ingredient")).toHaveValue("");
  });

  it("commits a step on Enter but keeps Shift+Enter as a line break", async () => {
    render(<RecipeForm action={noop()} cookbookId="cb1" />);
    const composer = screen.getByLabelText("Next step");

    await userEvent.type(composer, "line one{Shift>}{Enter}{/Shift}line two");
    expect(composer).toHaveValue("line one\nline two");

    await userEvent.type(composer, "{Enter}");
    expect(composer).toHaveValue("");
  });

  it("numbers the committed steps", async () => {
    render(<RecipeForm action={noop()} cookbookId="cb1" />);

    await addStep("Boil.");
    await addStep("Mix.");

    expect(screen.getByText("1.")).toBeInTheDocument();
    expect(screen.getByText("2.")).toBeInTheDocument();
  });
});

describe("RecipeForm — editing committed rows", () => {
  it("turns a committed ingredient into fields when clicked", async () => {
    render(<RecipeForm action={noop()} cookbookId="cb1" />);
    await addIngredient("spaghetti", { quantity: "200", unit: "g" });

    await userEvent.click(screen.getByText("200 g spaghetti"));

    expect(screen.getByLabelText("Edit ingredient")).toHaveValue("spaghetti");
    expect(screen.getByLabelText("Edit quantity")).toHaveValue("200");
  });

  it("saves an edit and returns to the text view", async () => {
    render(<RecipeForm action={noop()} cookbookId="cb1" />);
    await addIngredient("spagetti");

    await userEvent.click(screen.getByText("spagetti"));
    const field = screen.getByLabelText("Edit ingredient");
    await userEvent.clear(field);
    await userEvent.type(field, "spaghetti{Enter}");

    expect(screen.getByText("spaghetti")).toBeInTheDocument();
    expect(screen.queryByLabelText("Edit ingredient")).not.toBeInTheDocument();
  });

  it("abandons an edit on Escape", async () => {
    render(<RecipeForm action={noop()} cookbookId="cb1" />);
    await addIngredient("salt");

    await userEvent.click(screen.getByText("salt"));
    const field = screen.getByLabelText("Edit ingredient");
    await userEvent.clear(field);
    await userEvent.type(field, "pepper{Escape}");

    expect(screen.getByText("salt")).toBeInTheDocument();
  });

  it("edits a committed step", async () => {
    render(<RecipeForm action={noop()} cookbookId="cb1" />);
    await addStep("Boil.");

    await userEvent.click(screen.getByText("Boil."));
    const field = screen.getByLabelText("Edit step 1");
    await userEvent.clear(field);
    await userEvent.type(field, "Simmer.{Enter}");

    expect(screen.getByText("Simmer.")).toBeInTheDocument();
  });

  it("removes a committed ingredient", async () => {
    render(<RecipeForm action={noop()} cookbookId="cb1" />);
    await addIngredient("salt");

    await userEvent.click(screen.getByLabelText("Remove salt"));

    expect(screen.queryByText("salt")).not.toBeInTheDocument();
  });
});

describe("RecipeForm — reordering", () => {
  it("moves an ingredient down and back up", async () => {
    render(<RecipeForm action={noop()} cookbookId="cb1" />);
    await addIngredient("first");
    await addIngredient("second");

    await userEvent.click(screen.getByLabelText("Move first down"));
    expect(
      screen.getAllByRole("listitem").map((li) => li.textContent),
    ).toEqual(expect.arrayContaining([expect.stringContaining("second")]));
    expect(screen.getAllByRole("listitem")[0].textContent).toContain("second");

    await userEvent.click(screen.getByLabelText("Move first up"));
    expect(screen.getAllByRole("listitem")[0].textContent).toContain("first");
  });

  it("disables the boundary arrows", async () => {
    render(<RecipeForm action={noop()} cookbookId="cb1" />);
    await addIngredient("first");
    await addIngredient("second");

    expect(screen.getByLabelText("Move first up")).toBeDisabled();
    expect(screen.getByLabelText("Move second down")).toBeDisabled();
  });

  it("renumbers steps after a reorder", async () => {
    render(<RecipeForm action={noop()} cookbookId="cb1" />);
    await addStep("Boil.");
    await addStep("Mix.");

    await userEvent.click(screen.getByLabelText("Move step 2 up"));

    const items = screen.getAllByRole("listitem");
    expect(items[0].textContent).toContain("Mix.");
    expect(items[1].textContent).toContain("Boil.");
  });
});

describe("RecipeForm — submission", () => {
  it("submits committed rows in order", async () => {
    const action = vi.fn<FormAction>(async () => ({}));
    render(<RecipeForm action={action} cookbookId="cb1" />);

    await userEvent.type(screen.getByLabelText("Title"), "Carbonara");
    await addIngredient("spaghetti", { quantity: "200", unit: "g" });
    await addIngredient("egg");
    await addStep("Boil.");
    await userEvent.click(screen.getByRole("button", { name: /save recipe/i }));

    const fd = action.mock.calls[0][1];
    expect(fd.get("title")).toBe("Carbonara");
    expect(fd.getAll("ingredientName")).toEqual(["spaghetti", "egg"]);
    expect(fd.getAll("ingredientQuantity")).toEqual(["200", ""]);
    expect(fd.getAll("stepInstruction")).toEqual(["Boil."]);
  });

  it("submits in the reordered sequence", async () => {
    const action = vi.fn<FormAction>(async () => ({}));
    render(<RecipeForm action={action} cookbookId="cb1" />);

    await addIngredient("first");
    await addIngredient("second");
    await userEvent.click(screen.getByLabelText("Move second up"));
    await userEvent.click(screen.getByRole("button", { name: /save recipe/i }));

    expect(action.mock.calls[0][1].getAll("ingredientName")).toEqual([
      "second",
      "first",
    ]);
  });

  // The trap of a composer UI: content typed but never "Added". Dropping it
  // silently would lose the user's work.
  it("includes an ingredient still sitting in the composer", async () => {
    const action = vi.fn<FormAction>(async () => ({}));
    render(<RecipeForm action={action} cookbookId="cb1" />);

    await addIngredient("committed");
    await userEvent.type(screen.getByLabelText("Ingredient"), "forgotten");
    await userEvent.click(screen.getByRole("button", { name: /save recipe/i }));

    expect(action.mock.calls[0][1].getAll("ingredientName")).toEqual([
      "committed",
      "forgotten",
    ]);
  });

  it("includes a step still sitting in the composer", async () => {
    const action = vi.fn<FormAction>(async () => ({}));
    render(<RecipeForm action={action} cookbookId="cb1" />);

    await userEvent.type(screen.getByLabelText("Next step"), "forgotten");
    await userEvent.click(screen.getByRole("button", { name: /save recipe/i }));

    expect(action.mock.calls[0][1].getAll("stepInstruction")).toEqual([
      "forgotten",
    ]);
  });

  it("ignores a composer holding only whitespace", async () => {
    const action = vi.fn<FormAction>(async () => ({}));
    render(<RecipeForm action={action} cookbookId="cb1" />);

    await userEvent.type(screen.getByLabelText("Next step"), "   ");
    await userEvent.click(screen.getByRole("button", { name: /save recipe/i }));

    expect(action.mock.calls[0][1].getAll("stepInstruction")).toEqual([]);
  });

  it("shows a server error in an alert and marks the title invalid", async () => {
    const action = vi.fn<FormAction>(async () => ({
      error: "Add at least one step.",
      values: {
        title: "Carbonara",
        description: "",
        servings: "",
        prepTimeMinutes: "",
        cookTimeMinutes: "",
        ingredients: [],
        steps: [],
      },
    }));
    render(<RecipeForm action={action} cookbookId="cb1" />);

    await userEvent.click(screen.getByRole("button", { name: /save recipe/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Add at least one step.",
    );
    expect(screen.getByLabelText("Title")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("restores every committed row from the server's echo", async () => {
    const action = vi.fn<FormAction>(async () => ({
      error: "Add at least one step.",
      values: {
        title: "Carbonara",
        description: "Rich.",
        servings: "4",
        prepTimeMinutes: "",
        cookTimeMinutes: "",
        ingredients: [
          { name: "spaghetti", quantity: "200", unit: "g", note: "" },
          { name: "egg", quantity: "2", unit: "", note: "yolks only" },
        ],
        steps: ["Boil.", "Mix."],
      },
    }));
    render(<RecipeForm action={action} cookbookId="cb1" />);

    await userEvent.click(screen.getByRole("button", { name: /save recipe/i }));
    await screen.findByRole("alert");

    expect(screen.getByLabelText("Title")).toHaveValue("Carbonara");
    expect(screen.getByText("200 g spaghetti")).toBeInTheDocument();
    expect(screen.getByText("2 egg")).toBeInTheDocument();
    expect(screen.getByText("yolks only")).toBeInTheDocument();
    expect(screen.getByText("Boil.")).toBeInTheDocument();
    expect(screen.getByText("Mix.")).toBeInTheDocument();
  });
});
