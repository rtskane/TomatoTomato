import { describe, it, expect, vi, beforeEach } from "vitest";

const { redirect, revalidatePath, requireOnboardedUser, createCookbook } =
  vi.hoisted(() => ({
    redirect: vi.fn((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    }),
    revalidatePath: vi.fn(),
    requireOnboardedUser: vi.fn(),
    createCookbook: vi.fn(),
  }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/user", () => ({ requireOnboardedUser }));
vi.mock("@/server/services/cookbook.service", () => ({ createCookbook }));

import { createCookbookAction } from "./actions";

function formOf(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createCookbookAction", () => {
  it("lets the auth gate's redirect propagate and never calls the service", async () => {
    // requireOnboardedUser redirects internally for signed-out / un-onboarded
    // visitors; the action must not swallow that.
    requireOnboardedUser.mockRejectedValue(new Error("REDIRECT:/sign-in"));

    await expect(
      createCookbookAction({}, formOf({ title: "Weeknight Dinners" })),
    ).rejects.toThrow("REDIRECT:/sign-in");
    expect(createCookbook).not.toHaveBeenCalled();
  });

  it("calls the service with the internal user id and form values", async () => {
    requireOnboardedUser.mockResolvedValue({ id: "u1", username: "chef_ryan" });
    createCookbook.mockResolvedValue({ ok: true, value: { id: "cb1" } });

    await expect(
      createCookbookAction(
        {},
        formOf({ title: "Weeknight Dinners", description: "Fast meals." }),
      ),
      // Step one hands the owner straight to the cover step of the cookbook
      // it just created, rather than back to the library.
    ).rejects.toThrow("REDIRECT:/cookbooks/cb1/setup/cover");

    expect(createCookbook).toHaveBeenCalledWith("u1", {
      title: "Weeknight Dinners",
      description: "Fast meals.",
    });
  });

  it("returns error state (no redirect) when the service reports a failure", async () => {
    requireOnboardedUser.mockResolvedValue({ id: "u1", username: "chef_ryan" });
    createCookbook.mockResolvedValue({
      ok: false,
      error: { kind: "validation", message: "Give your cookbook a title." },
    });

    const values = { title: "", description: "" };
    const result = await createCookbookAction({}, formOf(values));

    expect(result).toEqual({ error: "Give your cookbook a title.", values });
    expect(redirect).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  // The library is revalidated even though the owner is sent to the cover step
  // rather than to it: they land on the dashboard eventually, and its router
  // cache still holds a render from before this cookbook existed.
  it("revalidates the library, then sends the owner on to the cover step", async () => {
    requireOnboardedUser.mockResolvedValue({ id: "u1", username: "chef_ryan" });
    createCookbook.mockResolvedValue({ ok: true, value: { id: "cb1" } });

    await expect(
      createCookbookAction({}, formOf({ title: "Weeknight Dinners" })),
    ).rejects.toThrow("REDIRECT:/cookbooks/cb1/setup/cover");

    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(redirect).toHaveBeenCalledWith("/cookbooks/cb1/setup/cover");
  });

  it("defaults missing form fields to empty strings", async () => {
    requireOnboardedUser.mockResolvedValue({ id: "u1", username: "chef_ryan" });
    createCookbook.mockResolvedValue({ ok: true, value: { id: "cb1" } });

    await expect(createCookbookAction({}, new FormData())).rejects.toThrow(
      "REDIRECT:/cookbooks/cb1/setup/cover",
    );

    expect(createCookbook).toHaveBeenCalledWith("u1", {
      title: "",
      description: "",
    });
  });
});
