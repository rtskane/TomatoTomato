import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  redirect,
  revalidatePath,
  requireOnboardedUser,
  updateCookbook,
  archiveCookbook,
  restoreCookbook,
  deleteCookbookForever,
  deleteImages,
} = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  revalidatePath: vi.fn(),
  requireOnboardedUser: vi.fn(),
  updateCookbook: vi.fn(),
  archiveCookbook: vi.fn(),
  restoreCookbook: vi.fn(),
  deleteCookbookForever: vi.fn(),
  deleteImages: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/user", () => ({ requireOnboardedUser }));
vi.mock("@/server/services/cookbook.service", () => ({
  updateCookbook,
  archiveCookbook,
  restoreCookbook,
  deleteCookbookForever,
}));
vi.mock("@/server/blob", () => ({ deleteCoverImage: vi.fn(), deleteImages }));

import {
  updateCookbookAction,
  archiveCookbookAction,
  restoreCookbookAction,
  deleteCookbookForeverAction,
} from "./settings-actions";

function formOf(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireOnboardedUser.mockResolvedValue({ id: "owner1" });
  updateCookbook.mockResolvedValue({ ok: true, value: { id: "cb1" } });
  archiveCookbook.mockResolvedValue({ ok: true, value: true });
  restoreCookbook.mockResolvedValue({ ok: true, value: true });
  deleteCookbookForever.mockResolvedValue({
    ok: true,
    value: { orphanedImages: ["https://blob/cover.jpg"] },
  });
});

describe("updateCookbookAction", () => {
  it("passes the session user, never one from the form", async () => {
    await updateCookbookAction("cb1", {}, formOf({ title: "New name" }));

    expect(updateCookbook).toHaveBeenCalledWith("owner1", "cb1", {
      title: "New name",
      description: "",
      coverImageUrl: "",
      coverColor: "",
      coverStyle: "",
      coverTexture: "",
      coverTitleFont: "",
      coverTitleSize: "",
      coverTitlePosition: "",
      coverFocalX: "",
      coverFocalY: "",
      coverZoom: "",
    });
  });

  it("echoes the values back on failure so nothing is retyped", async () => {
    updateCookbook.mockResolvedValue({
      ok: false,
      error: { kind: "validation", message: "Give your cookbook a title." },
    });

    const state = await updateCookbookAction("cb1", {}, formOf({ title: "" }));

    expect(state.error).toBe("Give your cookbook a title.");
    expect(state.values?.title).toBe("");
  });

  it("refreshes the dashboard, which lists cookbooks by title", async () => {
    await updateCookbookAction("cb1", {}, formOf({ title: "New name" }));

    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });
});

describe("archiveCookbookAction", () => {
  it("archives with the bound id and the session user, then leaves", async () => {
    await expect(
      archiveCookbookAction("cb1", {}, new FormData()),
    ).rejects.toThrow("REDIRECT:/dashboard");

    expect(archiveCookbook).toHaveBeenCalledWith("owner1", "cb1");
  });

  it("surfaces a service refusal instead of redirecting", async () => {
    archiveCookbook.mockResolvedValue({
      ok: false,
      error: { kind: "forbidden", message: "Only the owner can change this cookbook." },
    });

    const state = await archiveCookbookAction("cb1", {}, new FormData());

    expect(state.error).toMatch(/only the owner/i);
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("restoreCookbookAction", () => {
  it("restores using the bound id and the session user", async () => {
    const state = await restoreCookbookAction("cb1", {}, new FormData());

    expect(restoreCookbook).toHaveBeenCalledWith("owner1", "cb1");
    expect(state.error).toBeUndefined();
  });

  it("reports a refusal", async () => {
    restoreCookbook.mockResolvedValue({
      ok: false,
      error: { kind: "forbidden", message: "Only the owner can change this cookbook." },
    });

    const state = await restoreCookbookAction("cb1", {}, new FormData());

    expect(state.error).toMatch(/only the owner/i);
  });
});

describe("deleteCookbookForeverAction", () => {
  it("deletes with the bound id, then clears the files it left", async () => {
    const state = await deleteCookbookForeverAction("cb1", {}, new FormData());

    expect(deleteCookbookForever).toHaveBeenCalledWith("owner1", "cb1");
    expect(deleteImages).toHaveBeenCalledWith(["https://blob/cover.jpg"]);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(state.error).toBeUndefined();
  });

  it("keeps the files when the delete is refused", async () => {
    deleteCookbookForever.mockResolvedValue({
      ok: false,
      error: { kind: "forbidden", message: "Only the owner can change this cookbook." },
    });

    const state = await deleteCookbookForeverAction("cb1", {}, new FormData());

    expect(state.error).toMatch(/only the owner/i);
    expect(deleteImages).not.toHaveBeenCalled();
  });
});
