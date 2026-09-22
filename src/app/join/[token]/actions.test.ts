import { describe, it, expect, vi, beforeEach } from "vitest";

const { redirect, revalidatePath, requireOnboardedUser, joinWithLink } =
  vi.hoisted(() => ({
    redirect: vi.fn((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    }),
    revalidatePath: vi.fn(),
    requireOnboardedUser: vi.fn(),
    joinWithLink: vi.fn(),
  }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/user", () => ({ requireOnboardedUser }));
vi.mock("@/server/services/member.service", () => ({ joinWithLink }));

import { joinWithLinkAction } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  requireOnboardedUser.mockResolvedValue({ id: "u2", username: "mum" });
  joinWithLink.mockResolvedValue({ ok: true, value: { cookbookId: "cb1" } });
});

describe("joinWithLinkAction", () => {
  it("lets the auth gate's redirect propagate and joins nothing", async () => {
    requireOnboardedUser.mockRejectedValue(new Error("REDIRECT:/sign-in"));

    await expect(joinWithLinkAction("tok", {}, new FormData())).rejects.toThrow(
      "REDIRECT:/sign-in",
    );
    expect(joinWithLink).not.toHaveBeenCalled();
  });

  it("joins as the signed-in user with the bound token, then opens the cookbook", async () => {
    await expect(joinWithLinkAction("tok", {}, new FormData())).rejects.toThrow(
      "REDIRECT:/cookbooks/cb1",
    );
    expect(joinWithLink).toHaveBeenCalledWith("u2", "tok");
    // The new book has to be on their shelf when they next look.
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("says why when the link stopped working", async () => {
    joinWithLink.mockResolvedValue({
      ok: false,
      error: { kind: "not-found", message: "This link doesn't work any more." },
    });

    expect(await joinWithLinkAction("tok", {}, new FormData())).toEqual({
      error: "This link doesn't work any more.",
    });
    expect(redirect).not.toHaveBeenCalled();
  });
});
