import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  findMembership,
  create,
  update,
  findForPermissionCheck,
  archive,
  restore,
  deleteArchived,
  listArchived,
} = vi.hoisted(() => ({
  findMembership: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  findForPermissionCheck: vi.fn(),
  archive: vi.fn(),
  restore: vi.fn(),
  deleteArchived: vi.fn(),
  listArchived: vi.fn(),
}));
vi.mock("@/server/repositories/cookbook.repository", () => ({
  cookbookRepository: { findMembership },
}));
vi.mock("@/server/repositories/recipe.repository", () => ({
  recipeRepository: {
    create,
    update,
    findForPermissionCheck,
    archive,
    restore,
    deleteArchived,
    listArchived,
  },
}));

import {
  createRecipe,
  updateRecipe,
  archiveRecipe,
  restoreRecipe,
  deleteRecipeForever,
  listArchivedRecipes,
  type CreateRecipeInput,
} from "./recipe.service";

beforeEach(() => {
  vi.clearAllMocks();
  findMembership.mockResolvedValue({ role: "EDITOR" });
  create.mockResolvedValue({ id: "r1" });
  update.mockResolvedValue({ id: "r1" });
  findForPermissionCheck.mockResolvedValue({
    id: "r1",
    authorId: "u1",
    cookbookId: "cb1",
    title: "Carbonara",
  });
});

function input(overrides: Partial<CreateRecipeInput> = {}): CreateRecipeInput {
  return {
    title: "Carbonara",
    description: "",
    servings: "",
    prepTimeMinutes: "",
    cookTimeMinutes: "",
    coverImageUrl: "",
    ingredients: [{ name: "spaghetti", quantity: "200", unit: "g", note: "" }],
    steps: ["Boil the pasta."],
    ...overrides,
  };
}

describe("createRecipe — authorization", () => {
  it("refuses a non-member", async () => {
    findMembership.mockResolvedValue(null);

    const result = await createRecipe("u1", "cb1", input());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("forbidden");
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses a VIEWER", async () => {
    findMembership.mockResolvedValue({ role: "VIEWER" });

    const result = await createRecipe("u1", "cb1", input());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("forbidden");
    expect(create).not.toHaveBeenCalled();
  });

  it("allows an OWNER", async () => {
    findMembership.mockResolvedValue({ role: "OWNER" });

    await expect(createRecipe("u1", "cb1", input())).resolves.toMatchObject({
      ok: true,
    });
  });

  // Order matters: a non-member shouldn't learn whether their input was valid.
  it("checks permission before validating, so bad input still reads as forbidden", async () => {
    findMembership.mockResolvedValue(null);

    const result = await createRecipe("u1", "cb1", input({ title: "" }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("forbidden");
  });

  it("scopes the membership lookup to the given cookbook and user", async () => {
    await createRecipe("u1", "cb1", input());

    expect(findMembership).toHaveBeenCalledWith("cb1", "u1");
  });
});

describe("createRecipe — validation", () => {
  it("rejects a missing title without writing", async () => {
    const result = await createRecipe("u1", "cb1", input({ title: "" }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("validation");
    expect(create).not.toHaveBeenCalled();
  });

  // Rows the user added but never filled in are noise, not errors.
  it("drops entirely blank ingredient rows", async () => {
    await createRecipe(
      "u1",
      "cb1",
      input({
        ingredients: [
          { name: "spaghetti", quantity: "200", unit: "g", note: "" },
          { name: "", quantity: "", unit: "", note: "" },
        ],
      }),
    );

    expect(create.mock.calls[0][0].ingredients).toHaveLength(1);
  });

  it("drops blank step rows", async () => {
    await createRecipe(
      "u1",
      "cb1",
      input({ steps: ["Boil the pasta.", "   ", ""] }),
    );

    expect(create.mock.calls[0][0].steps).toEqual(["Boil the pasta."]);
  });

  // A half-filled row is a real mistake and must still surface.
  it("still rejects a row with a quantity but no name", async () => {
    const result = await createRecipe(
      "u1",
      "cb1",
      input({
        ingredients: [{ name: "", quantity: "200", unit: "g", note: "" }],
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("validation");
  });

  it("rejects a recipe whose only ingredient row was blank", async () => {
    const result = await createRecipe(
      "u1",
      "cb1",
      input({ ingredients: [{ name: "", quantity: "", unit: "", note: "" }] }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/at least one ingredient/i);
    }
  });

  it("rejects a recipe with no usable steps", async () => {
    const result = await createRecipe("u1", "cb1", input({ steps: ["  "] }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/at least one step/i);
  });
});

describe("createRecipe — persistence", () => {
  it("passes the author, cookbook and parsed fields to the repository", async () => {
    await createRecipe(
      "u1",
      "cb1",
      input({ servings: "4", prepTimeMinutes: "15", cookTimeMinutes: "20" }),
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        cookbookId: "cb1",
        authorId: "u1",
        title: "Carbonara",
        servings: 4,
        prepTimeMinutes: 15,
        cookTimeMinutes: 20,
        coverImageUrl: null,
      }),
    );
  });

  it("converts absent optional fields to null for the database", async () => {
    await createRecipe("u1", "cb1", input());

    expect(create.mock.calls[0][0]).toMatchObject({
      description: null,
      servings: null,
      prepTimeMinutes: null,
      cookTimeMinutes: null,
      coverImageUrl: null,
    });
    expect(create.mock.calls[0][0].ingredients[0]).toMatchObject({
      unit: "g",
      note: null,
    });
  });

  it("preserves the order of ingredients and steps", async () => {
    await createRecipe(
      "u1",
      "cb1",
      input({
        ingredients: [
          { name: "first", quantity: "", unit: "", note: "" },
          { name: "second", quantity: "", unit: "", note: "" },
        ],
        steps: ["one", "two", "three"],
      }),
    );

    expect(create.mock.calls[0][0].ingredients.map((i: { name: string }) => i.name)).toEqual(
      ["first", "second"],
    );
    expect(create.mock.calls[0][0].steps).toEqual(["one", "two", "three"]);
  });

  it("records which way in the recipe came through", async () => {
    await createRecipe("u1", "cb1", input(), "PHOTO");

    expect(create.mock.calls[0][0]).toMatchObject({ source: "PHOTO" });
  });

  // Recipes saved without one — and every recipe from before it was recorded —
  // read as "unknown", never as a guess.
  it("records an unknown source as null", async () => {
    await createRecipe("u1", "cb1", input());

    expect(create.mock.calls[0][0]).toMatchObject({ source: null });
  });

  it("returns the new recipe id", async () => {
    const result = await createRecipe("u1", "cb1", input());

    expect(result).toEqual({ ok: true, value: { id: "r1" } });
  });

  it("rethrows unexpected repository errors", async () => {
    create.mockRejectedValue(new Error("connection lost"));

    await expect(createRecipe("u1", "cb1", input())).rejects.toThrow(
      "connection lost",
    );
  });
});

// ---------------------------------------------------------------------------
// Editing and deleting share one rule: your own recipe, or you own the cookbook.
// ---------------------------------------------------------------------------

describe("updateRecipe", () => {
  it("lets an author edit their own recipe", async () => {
    findMembership.mockResolvedValue({ role: "EDITOR" });
    findForPermissionCheck.mockResolvedValue({
      id: "r1",
      authorId: "u1",
      cookbookId: "cb1",
      title: "Carbonara",
    });

    const result = await updateRecipe("u1", "cb1", "r1", input());

    expect(result.ok).toBe(true);
    expect(update).toHaveBeenCalled();
  });

  // The distinction the old permission model couldn't draw: an EDITOR who can
  // add recipes still can't rewrite someone else's.
  it("refuses an EDITOR editing someone else's recipe", async () => {
    findMembership.mockResolvedValue({ role: "EDITOR" });
    findForPermissionCheck.mockResolvedValue({
      id: "r1",
      authorId: "someone_else",
      cookbookId: "cb1",
      title: "Carbonara",
    });

    const result = await updateRecipe("u1", "cb1", "r1", input());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("forbidden");
    expect(update).not.toHaveBeenCalled();
  });

  it("lets the OWNER edit a recipe they didn't write", async () => {
    findMembership.mockResolvedValue({ role: "OWNER" });
    findForPermissionCheck.mockResolvedValue({
      id: "r1",
      authorId: "someone_else",
      cookbookId: "cb1",
      title: "Carbonara",
    });

    const result = await updateRecipe("owner1", "cb1", "r1", input());

    expect(result.ok).toBe(true);
  });

  it("refuses a VIEWER editing even their own recipe", async () => {
    findMembership.mockResolvedValue({ role: "VIEWER" });

    const result = await updateRecipe("u1", "cb1", "r1", input());

    expect(result.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses a non-member", async () => {
    findMembership.mockResolvedValue(null);

    const result = await updateRecipe("u1", "cb1", "r1", input());

    expect(result.ok).toBe(false);
    expect(findForPermissionCheck).not.toHaveBeenCalled();
  });

  // Both ids come from the URL; the repository scopes by cookbook so a recipe
  // can't be edited through a cookbook it doesn't belong to.
  it("looks the recipe up scoped to its cookbook", async () => {
    await updateRecipe("u1", "cb1", "r1", input());

    expect(findForPermissionCheck).toHaveBeenCalledWith("cb1", "r1");
  });

  it("reads as forbidden when the recipe doesn't exist", async () => {
    findForPermissionCheck.mockResolvedValue(null);

    const result = await updateRecipe("u1", "cb1", "nope", input());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("forbidden");
  });

  it("still validates the input", async () => {
    const result = await updateRecipe("u1", "cb1", "r1", input({ title: "" }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("validation");
    expect(update).not.toHaveBeenCalled();
  });

  // Editing must not let a recipe change hands or move cookbooks.
  it("never sends an author or cookbook to the repository", async () => {
    // "u1" is the author in the default mock, so this is an allowed edit.
    await updateRecipe("u1", "cb1", "r1", input());

    const payload = update.mock.calls[0][0];
    expect(payload).not.toHaveProperty("authorId");
    expect(payload).not.toHaveProperty("cookbookId");
    expect(payload.recipeId).toBe("r1");
  });

  it("drops blank ingredient rows the same way create does", async () => {
    await updateRecipe(
      "u1",
      "cb1",
      "r1",
      input({
        ingredients: [
          { name: "spaghetti", quantity: "200", unit: "g", note: "" },
          { name: "", quantity: "", unit: "", note: "" },
        ],
      }),
    );

    expect(update.mock.calls[0][0].ingredients).toHaveLength(1);
  });
});

function archivedRecipe(overrides: Record<string, unknown> = {}) {
  return {
    id: "r1",
    authorId: "u1",
    cookbookId: "cb1",
    title: "Carbonara",
    coverImageUrl: "https://blob/carbonara.jpg",
    archivedAt: new Date(),
    ...overrides,
  };
}

describe("updateRecipe — archived", () => {
  // A stale edit form must not quietly rewrite a recipe that has been archived.
  it("refuses to edit an archived recipe", async () => {
    findForPermissionCheck.mockResolvedValue(archivedRecipe());

    const result = await updateRecipe("u1", "cb1", "r1", input());

    expect(result.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});

describe("archiveRecipe", () => {
  it("lets an author archive their own recipe", async () => {
    const result = await archiveRecipe("u1", "cb1", "r1");

    expect(result.ok).toBe(true);
    expect(archive).toHaveBeenCalledWith("r1");
  });

  it("refuses an EDITOR archiving someone else's recipe", async () => {
    findForPermissionCheck.mockResolvedValue({
      id: "r1",
      authorId: "someone_else",
      cookbookId: "cb1",
      title: "Carbonara",
    });

    const result = await archiveRecipe("u1", "cb1", "r1");

    expect(result.ok).toBe(false);
    expect(archive).not.toHaveBeenCalled();
  });

  it("lets the OWNER archive any recipe", async () => {
    findMembership.mockResolvedValue({ role: "OWNER" });
    findForPermissionCheck.mockResolvedValue({
      id: "r1",
      authorId: "someone_else",
      cookbookId: "cb1",
      title: "Carbonara",
    });

    const result = await archiveRecipe("owner1", "cb1", "r1");

    expect(result.ok).toBe(true);
  });

  it("refuses a VIEWER", async () => {
    findMembership.mockResolvedValue({ role: "VIEWER" });

    const result = await archiveRecipe("u1", "cb1", "r1");

    expect(result.ok).toBe(false);
    expect(archive).not.toHaveBeenCalled();
  });

  it("refuses a recipe that is already archived", async () => {
    findForPermissionCheck.mockResolvedValue(archivedRecipe());

    const result = await archiveRecipe("u1", "cb1", "r1");

    expect(result.ok).toBe(false);
    expect(archive).not.toHaveBeenCalled();
  });
});

describe("restoreRecipe", () => {
  it("restores an archived recipe for its author", async () => {
    findForPermissionCheck.mockResolvedValue(archivedRecipe());

    const result = await restoreRecipe("u1", "cb1", "r1");

    expect(result.ok).toBe(true);
    expect(restore).toHaveBeenCalledWith("r1");
  });

  it("refuses a recipe that isn't archived", async () => {
    const result = await restoreRecipe("u1", "cb1", "r1");

    expect(result.ok).toBe(false);
    expect(restore).not.toHaveBeenCalled();
  });

  it("refuses an EDITOR restoring someone else's recipe", async () => {
    findForPermissionCheck.mockResolvedValue(
      archivedRecipe({ authorId: "someone_else" }),
    );

    const result = await restoreRecipe("u1", "cb1", "r1");

    expect(result.ok).toBe(false);
    expect(restore).not.toHaveBeenCalled();
  });
});

describe("deleteRecipeForever", () => {
  it("deletes an archived recipe and hands back its photo", async () => {
    findForPermissionCheck.mockResolvedValue(archivedRecipe());

    const result = await deleteRecipeForever("u1", "cb1", "r1");

    expect(result).toEqual({
      ok: true,
      value: { orphanedImage: "https://blob/carbonara.jpg" },
    });
    expect(deleteArchived).toHaveBeenCalledWith("r1");
  });

  // Nothing is ever one step from gone: a live recipe has to be archived first.
  it("refuses a live recipe", async () => {
    const result = await deleteRecipeForever("u1", "cb1", "r1");

    expect(result.ok).toBe(false);
    expect(deleteArchived).not.toHaveBeenCalled();
  });

  it("refuses a VIEWER", async () => {
    findMembership.mockResolvedValue({ role: "VIEWER" });
    findForPermissionCheck.mockResolvedValue(archivedRecipe());

    const result = await deleteRecipeForever("u1", "cb1", "r1");

    expect(result.ok).toBe(false);
    expect(deleteArchived).not.toHaveBeenCalled();
  });

  it("lets the OWNER delete someone else's archived recipe", async () => {
    findMembership.mockResolvedValue({ role: "OWNER" });
    findForPermissionCheck.mockResolvedValue(
      archivedRecipe({ authorId: "someone_else" }),
    );

    const result = await deleteRecipeForever("owner1", "cb1", "r1");

    expect(result.ok).toBe(true);
  });
});

describe("listArchivedRecipes", () => {
  const rows = [
    { id: "r1", title: "Mine", authorId: "u1" },
    { id: "r2", title: "Theirs", authorId: "someone_else" },
  ];

  beforeEach(() => listArchived.mockResolvedValue(rows));

  it("shows the owner every archived recipe", async () => {
    findMembership.mockResolvedValue({ role: "OWNER" });

    const result = await listArchivedRecipes("u1", "cb1");

    expect(result.map((r) => r.id)).toEqual(["r1", "r2"]);
  });

  it("shows an EDITOR only their own", async () => {
    const result = await listArchivedRecipes("u1", "cb1");

    expect(result).toEqual([{ id: "r1", title: "Mine" }]);
  });

  it("shows a VIEWER nothing", async () => {
    findMembership.mockResolvedValue({ role: "VIEWER" });

    await expect(listArchivedRecipes("u1", "cb1")).resolves.toEqual([]);
  });

  it("shows a non-member nothing, without reading the recipes", async () => {
    findMembership.mockResolvedValue(null);

    await expect(listArchivedRecipes("u1", "cb1")).resolves.toEqual([]);
    expect(listArchived).not.toHaveBeenCalled();
  });
});

describe("createRecipe — photo", () => {
  const BLOB = "https://abc123.public.blob.vercel-storage.com/recipe-photos/dinner.jpg";

  it("stores a photo from our own blob store", async () => {
    const result = await createRecipe("u1", "cb1", input({ coverImageUrl: BLOB }));

    expect(result.ok).toBe(true);
    expect(create.mock.calls[0][0]).toMatchObject({ coverImageUrl: BLOB });
  });

  // It arrives in a hidden field and is rendered straight into the page, so a
  // crafted POST mustn't be able to point it anywhere else.
  it.each([
    "https://example.com/dinner.jpg",
    "http://abc123.public.blob.vercel-storage.com/recipe-photos/dinner.jpg",
    "javascript:alert(1)",
  ])("refuses %s, and saves nothing", async (url) => {
    const result = await createRecipe("u1", "cb1", input({ coverImageUrl: url }));

    expect(result).toMatchObject({ ok: false, error: { kind: "validation" } });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("updateRecipe — photo", () => {
  // Removing the photo in the form submits an empty field. That has to clear
  // the column, not leave the old picture in place.
  it("clears the photo when the form sends none", async () => {
    await updateRecipe("u1", "cb1", "r1", input({ coverImageUrl: "" }));
    expect(update.mock.calls[0][0]).toMatchObject({ coverImageUrl: null });
  });
});
