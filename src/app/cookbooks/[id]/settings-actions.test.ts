import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  redirect,
  revalidatePath,
  requireOnboardedUser,
  updateCookbook,
  archiveCookbook,
  restoreCookbook,
} = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  revalidatePath: vi.fn(),
  requireOnboardedUser: vi.fn(),
  updateCookbook: vi.fn(),
  archiveCookbook: vi.fn(),
  restoreCookbook: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/user", () => ({ requireOnboardedUser }));
vi.mock("@/server/services/cookbook.service", () => ({
  updateCookbook,
  archiveCookbook,
  restoreCookbook,
}));

import {
  updateCookbookAction,
  archiveCookbookAction,
  restoreCookbookAction,
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

// The typed-name confirmation is a real guard, not decoration: this action
// accepts direct POSTs, so a check that only the dialog enforced would be
// trivially skipped.
describe("archiveCookbookAction", () => {
  it("archives when the typed name matches", async () => {
    await expect(
      archiveCookbookAction(
        "cb1",
        "Weeknight Dinners",
        {},
        formOf({ confirmTitle: "Weeknight Dinners" }),
      ),
    ).rejects.toThrow("REDIRECT:/dashboard");

    expect(archiveCookbook).toHaveBeenCalledWith("owner1", "cb1");
  });

  it("refuses a mismatched name without touching the service", async () => {
    const state = await archiveCookbookAction(
      "cb1",
      "Weeknight Dinners",
      {},
      formOf({ confirmTitle: "weeknight dinners" }),
    );

    expect(state.error).toMatch(/doesn't match/i);
    expect(archiveCookbook).not.toHaveBeenCalled();
  });

  it("refuses an empty confirmation", async () => {
    const state = await archiveCookbookAction(
      "cb1",
      "Weeknight Dinners",
      {},
      formOf({}),
    );

    expect(state.error).toBeDefined();
    expect(archiveCookbook).not.toHaveBeenCalled();
  });

  // Surrounding whitespace is a copy-paste artefact, not a different answer.
  it("tolerates surrounding whitespace", async () => {
    await expect(
      archiveCookbookAction(
        "cb1",
        "Weeknight Dinners",
        {},
        formOf({ confirmTitle: "  Weeknight Dinners  " }),
      ),
    ).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("surfaces a service refusal instead of redirecting", async () => {
    archiveCookbook.mockResolvedValue({
      ok: false,
      error: { kind: "forbidden", message: "Only the owner can change this cookbook." },
    });

    const state = await archiveCookbookAction(
      "cb1",
      "Weeknight Dinners",
      {},
      formOf({ confirmTitle: "Weeknight Dinners" }),
    );

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
