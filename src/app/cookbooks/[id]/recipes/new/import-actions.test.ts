import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireOnboardedUser, importFromText, importFromUrl } = vi.hoisted(
  () => ({
    requireOnboardedUser: vi.fn(),
    importFromText: vi.fn(),
    importFromUrl: vi.fn(),
  }),
);
vi.mock("@/lib/user", () => ({ requireOnboardedUser }));
vi.mock("@/server/services/recipe-import.service", () => ({
  importFromText,
  importFromUrl,
}));

import { importFromTextAction, importFromUrlAction } from "./import-actions";
import type { CreateRecipeValues } from "../recipe-form-data";

const carbonara: CreateRecipeValues = {
  title: "Carbonara",
  description: "",
  servings: "",
  prepTimeMinutes: "",
  cookTimeMinutes: "",
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
  importFromUrl.mockResolvedValue({ ok: true, value: carbonara });
});

// The two actions are the same adapter around different services, so every
// behaviour is checked against both.
describe.each([
  { name: "importFromTextAction", action: importFromTextAction, service: importFromText, field: "text", input: "Carbonara\nBoil the pasta." },
  { name: "importFromUrlAction", action: importFromUrlAction, service: importFromUrl, field: "url", input: "https://example.com/carbonara" },
])("$name", ({ action, service, field, input }) => {
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

  it("hands back the values for the form on success", async () => {
    expect(await action("cb1", {}, form(field, input))).toEqual({
      values: carbonara,
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
