import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireOnboardedUser, importFromText, importFromUrl, importFromPhoto } =
  vi.hoisted(() => ({
    requireOnboardedUser: vi.fn(),
    importFromText: vi.fn(),
    importFromUrl: vi.fn(),
    importFromPhoto: vi.fn(),
  }));
vi.mock("@/lib/user", () => ({ requireOnboardedUser }));
vi.mock("@/server/services/recipe-import.service", () => ({
  importFromText,
  importFromUrl,
}));
vi.mock("@/server/services/recipe-photo-import.service", () => ({
  importFromPhoto,
}));

import {
  importFromTextAction,
  importFromUrlAction,
  importFromPhotoAction,
} from "./import-actions";
import type { CreateRecipeValues } from "../recipe-form-data";

const carbonara: CreateRecipeValues = {
  title: "Carbonara",
  description: "",
  servings: "",
  prepTimeMinutes: "",
  cookTimeMinutes: "",
  coverImageUrl: "",
  ingredients: [{ name: "spaghetti", quantity: "200", unit: "g", note: "" }],
  steps: ["Boil the pasta."],
};

const form = (field: string, value: string) => {
  const fd = new FormData();
  fd.set(field, value);
  return fd;
};

beforeEach(() => {
  vi.clearAllMocks();
  requireOnboardedUser.mockResolvedValue({ id: "u1", username: "chef_ryan" });
  importFromText.mockResolvedValue({ ok: true, value: carbonara });
  importFromUrl.mockResolvedValue({
    ok: true,
    value: { values: carbonara, source: "LINK" },
  });
  importFromPhoto.mockResolvedValue({ ok: true, value: carbonara });
});

// The two actions are the same adapter around different services, so every
// behaviour is checked against both.
describe.each([
  { name: "importFromTextAction", action: importFromTextAction, service: importFromText, field: "text", input: "Carbonara\nBoil the pasta.", source: "PASTE" },
  { name: "importFromUrlAction", action: importFromUrlAction, service: importFromUrl, field: "url", input: "https://example.com/carbonara", source: "LINK" },
])("$name", ({ action, service, field, input, source }) => {
  it("lets the auth gate's redirect propagate and never calls the service", async () => {
    requireOnboardedUser.mockRejectedValue(new Error("REDIRECT:/sign-in"));

    await expect(action("cb1", {}, form(field, input))).rejects.toThrow(
      "REDIRECT:/sign-in",
    );
    // For the link importer this is the difference between a signed-out
    // stranger getting our server to fetch a URL and not.
    expect(service).not.toHaveBeenCalled();
  });

  // cookbookId is bound server-side, so it can't come from the submitted form.
  it("imports as the signed-in user, into the bound cookbook", async () => {
    const fd = form(field, input);
    fd.set("cookbookId", "cb_attacker");

    await action("cb1", {}, fd);

    expect(service).toHaveBeenCalledWith("u1", "cb1", input);
  });

  it("hands back the values for the form, and where they came from", async () => {
    expect(await action("cb1", {}, form(field, input))).toEqual({
      values: carbonara,
      source,
    });
  });

  it("returns the service's message and echoes the input on failure", async () => {
    service.mockResolvedValue({
      ok: false,
      error: { kind: "forbidden", message: "You don't have permission." },
    });

    expect(await action("cb1", {}, form(field, input))).toEqual({
      error: "You don't have permission.",
      submitted: input,
    });
  });

  it("treats a missing field as an empty submission", async () => {
    await action("cb1", {}, new FormData());
    expect(service).toHaveBeenCalledWith("u1", "cb1", "");
  });
});

// The photo importer takes a File, not a string, and has nothing to echo back
// on failure — there's no text field for `submitted` to rescue — so it gets
// its own cases rather than joining the table above.
describe("importFromPhotoAction", () => {
  const photoForm = (file?: File) => {
    const fd = new FormData();
    if (file) fd.set("photo", file);
    return fd;
  };
  const photo = () => new File(["fake-jpeg-bytes"], "card.jpg", { type: "image/jpeg" });

  it("lets the auth gate's redirect propagate and never calls the service", async () => {
    requireOnboardedUser.mockRejectedValue(new Error("REDIRECT:/sign-in"));

    await expect(
      importFromPhotoAction("cb1", {}, photoForm(photo())),
    ).rejects.toThrow("REDIRECT:/sign-in");
    expect(importFromPhoto).not.toHaveBeenCalled();
  });

  it("imports as the signed-in user, into the bound cookbook", async () => {
    const file = photo();
    await importFromPhotoAction("cb1", {}, photoForm(file));
    expect(importFromPhoto).toHaveBeenCalledWith("u1", "cb1", file);
  });

  it("hands back the values for the form, and where they came from", async () => {
    expect(await importFromPhotoAction("cb1", {}, photoForm(photo()))).toEqual({
      values: carbonara,
      source: "PHOTO",
    });
  });

  it("returns the service's message on failure", async () => {
    importFromPhoto.mockResolvedValue({
      ok: false,
      error: { kind: "unparseable", message: "We couldn't make a recipe out of that photo." },
    });

    expect(await importFromPhotoAction("cb1", {}, photoForm(photo()))).toEqual({
      error: "We couldn't make a recipe out of that photo.",
    });
  });

  it("rejects a missing photo without calling the service", async () => {
    expect(await importFromPhotoAction("cb1", {}, photoForm())).toEqual({
      error: "Choose a photo first.",
    });
    expect(importFromPhoto).not.toHaveBeenCalled();
  });

  it("rejects an empty file without calling the service", async () => {
    const empty = new File([], "card.jpg", { type: "image/jpeg" });
    expect(await importFromPhotoAction("cb1", {}, photoForm(empty))).toEqual({
      error: "Choose a photo first.",
    });
    expect(importFromPhoto).not.toHaveBeenCalled();
  });
});
