import { describe, it, expect, vi, beforeEach } from "vitest";

const { redirect, revalidatePath, requireOnboardedUser, createRecipe } =
  vi.hoisted(() => ({
    redirect: vi.fn((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    }),
    revalidatePath: vi.fn(),
    requireOnboardedUser: vi.fn(),
    createRecipe: vi.fn(),
  }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/user", () => ({ requireOnboardedUser }));
vi.mock("@/server/services/recipe.service", () => ({ createRecipe }));

import { createRecipeAction } from "./actions";

// Mirrors what the browser submits: one entry per row, in DOM order.
function recipeForm({
  title = "Carbonara",
  ingredients = [{ quantity: "200", unit: "g", name: "spaghetti", note: "" }],
  steps = ["Boil the pasta."],
}: {
  title?: string;
  ingredients?: { quantity: string; unit: string; name: string; note: string }[];
  steps?: string[];
} = {}) {
  const fd = new FormData();
  fd.set("title", title);
  for (const row of ingredients) {
    fd.append("ingredientQuantity", row.quantity);
    fd.append("ingredientUnit", row.unit);
    fd.append("ingredientName", row.name);
    fd.append("ingredientNote", row.note);
  }
  for (const step of steps) fd.append("stepInstruction", step);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireOnboardedUser.mockResolvedValue({ id: "u1", username: "chef_ryan" });
  createRecipe.mockResolvedValue({ ok: true, value: { id: "r1" } });
});

describe("createRecipeAction", () => {
  it("lets the auth gate's redirect propagate and never calls the service", async () => {
    requireOnboardedUser.mockRejectedValue(new Error("REDIRECT:/sign-in"));

    await expect(
      createRecipeAction("cb1", {}, recipeForm()),
    ).rejects.toThrow("REDIRECT:/sign-in");
    expect(createRecipe).not.toHaveBeenCalled();
  });

  // cookbookId is bound server-side, so it can't come from the submitted form.
  it("uses the bound cookbook id, not anything in the form", async () => {
    const fd = recipeForm();
    fd.set("cookbookId", "cb_attacker");

    await expect(createRecipeAction("cb1", {}, fd)).rejects.toThrow(
      "REDIRECT:/cookbooks/cb1",
    );

    expect(createRecipe).toHaveBeenCalledWith("u1", "cb1", expect.anything());
  });

  it("zips the parallel ingredient fields back into ordered rows", async () => {
    await expect(
      createRecipeAction(
        "cb1",
        {},
        recipeForm({
          ingredients: [
            { quantity: "200", unit: "g", name: "spaghetti", note: "" },
            { quantity: "2", unit: "", name: "egg", note: "yolks only" },
          ],
        }),
      ),
    ).rejects.toThrow("REDIRECT:/cookbooks/cb1");

    expect(createRecipe.mock.calls[0][2].ingredients).toEqual([
      { quantity: "200", unit: "g", name: "spaghetti", note: "" },
      { quantity: "2", unit: "", name: "egg", note: "yolks only" },
    ]);
  });

  it("collects steps in submitted order", async () => {
    await expect(
      createRecipeAction("cb1", {}, recipeForm({ steps: ["one", "two"] })),
    ).rejects.toThrow("REDIRECT:/cookbooks/cb1");

    expect(createRecipe.mock.calls[0][2].steps).toEqual(["one", "two"]);
  });

  it("returns error state with the values echoed back, and does not redirect", async () => {
    createRecipe.mockResolvedValue({
      ok: false,
      error: { kind: "validation", message: "Add at least one step." },
    });

    const result = await createRecipeAction(
      "cb1",
      {},
      recipeForm({ steps: [] }),
    );

    expect(result.error).toBe("Add at least one step.");
    // The typed recipe must survive the round trip.
    expect(result.values?.title).toBe("Carbonara");
    expect(result.values?.ingredients).toHaveLength(1);
    expect(redirect).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces a forbidden result as error state rather than throwing", async () => {
    createRecipe.mockResolvedValue({
      ok: false,
      error: { kind: "forbidden", message: "You don't have permission." },
    });

    const result = await createRecipeAction("cb1", {}, recipeForm());

    expect(result.error).toBe("You don't have permission.");
  });

  it("revalidates and redirects to the cookbook on success", async () => {
    await expect(createRecipeAction("cb1", {}, recipeForm())).rejects.toThrow(
      "REDIRECT:/cookbooks/cb1",
    );

    expect(revalidatePath).toHaveBeenCalledWith("/cookbooks/cb1");
    expect(redirect).toHaveBeenCalledWith("/cookbooks/cb1");
  });

  it("defaults missing scalar fields to empty strings", async () => {
    const fd = new FormData();
    await expect(createRecipeAction("cb1", {}, fd)).rejects.toThrow(
      "REDIRECT:/cookbooks/cb1",
    );

    expect(createRecipe.mock.calls[0][2]).toMatchObject({
      title: "",
      description: "",
      servings: "",
      ingredients: [],
      steps: [],
    });
  });
});
