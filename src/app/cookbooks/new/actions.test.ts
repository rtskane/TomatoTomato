import { describe, it, expect, vi, beforeEach } from "vitest";

const { revalidatePath, requireOnboardedUser, createCookbook } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  requireOnboardedUser: vi.fn(),
  createCookbook: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/user", () => ({ requireOnboardedUser }));
vi.mock("@/server/services/cookbook.service", () => ({ createCookbook }));

import { createCookbookAction, type CreateCookbookInput } from "./actions";

const cover = { coverColor: "2", coverStyle: "TITLED", coverElements: "[]" };

beforeEach(() => {
  vi.clearAllMocks();
  requireOnboardedUser.mockResolvedValue({ id: "u1", username: "chef_ryan" });
  createCookbook.mockResolvedValue({ ok: true, value: { id: "cb1" } });
});

describe("createCookbookAction", () => {
  it("lets the auth gate's redirect propagate and never calls the service", async () => {
    // requireOnboardedUser redirects internally for signed-out / un-onboarded
    // visitors; the action must not swallow that.
    requireOnboardedUser.mockRejectedValue(new Error("REDIRECT:/sign-in"));

    await expect(
      createCookbookAction({ title: "Weeknight Dinners", cover }),
    ).rejects.toThrow("REDIRECT:/sign-in");
    expect(createCookbook).not.toHaveBeenCalled();
  });

  // The name and the cover are created together: one call, one row.
  it("creates the cookbook with its name and its cover in one call", async () => {
    await createCookbookAction({ title: "Weeknight Dinners", cover });

    expect(createCookbook).toHaveBeenCalledWith("u1", {
      title: "Weeknight Dinners",
      description: "",
      ...cover,
    });
  });

  // Returned, not redirected to: the page has a draft to throw away first,
  // and can only do that once it knows the cookbook exists.
  it("hands back the new cookbook's id", async () => {
    const result = await createCookbookAction({ title: "Weeknight Dinners", cover });
    expect(result).toEqual({ id: "cb1" });
  });

  it("refreshes the library, which may be cached from before this cookbook", async () => {
    await createCookbookAction({ title: "Weeknight Dinners", cover });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("returns the service's message when it refuses, and refreshes nothing", async () => {
    createCookbook.mockResolvedValue({
      ok: false,
      error: { kind: "validation", message: "Give your cookbook a title." },
    });

    const result = await createCookbookAction({ title: "", cover });

    expect(result).toEqual({ error: "Give your cookbook a title." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  // A Server Action's argument comes from the browser. Whatever shape arrives,
  // only known cover fields that are strings reach the service.
  it("passes on only the cover fields it knows, and only strings", async () => {
    const crafted = {
      title: "Soups",
      cover: { coverColor: 3, coverTexture: "GRID", ownerId: "someone-else" },
    } as unknown as CreateCookbookInput;

    await createCookbookAction(crafted);

    expect(createCookbook).toHaveBeenCalledWith("u1", {
      title: "Soups",
      description: "",
      coverTexture: "GRID",
    });
  });

  it.each([undefined, null, "text", { title: 7 }])(
    "survives an argument that isn't the expected shape (%j)",
    async (input) => {
      await createCookbookAction(input as unknown as CreateCookbookInput);
      expect(createCookbook).toHaveBeenCalledWith("u1", { title: "", description: "" });
    },
  );
});
