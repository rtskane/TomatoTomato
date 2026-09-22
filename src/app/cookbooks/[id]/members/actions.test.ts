import { describe, it, expect, vi, beforeEach } from "vitest";

const svc = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  requireOnboardedUser: vi.fn(),
  setJoinLinkEnabled: vi.fn(),
  setJoinLinkRole: vi.fn(),
  resetJoinLink: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: svc.revalidatePath }));
vi.mock("@/lib/user", () => ({ requireOnboardedUser: svc.requireOnboardedUser }));
vi.mock("@/server/services/member.service", () => ({
  setJoinLinkEnabled: svc.setJoinLinkEnabled,
  setJoinLinkRole: svc.setJoinLinkRole,
  resetJoinLink: svc.resetJoinLink,
}));

import {
  setJoinLinkEnabledAction,
  setJoinLinkRoleAction,
  resetJoinLinkAction,
} from "./actions";

const LINK = { token: "tok", role: "EDITOR" };

const form = (fields: Record<string, string> = {}) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

beforeEach(() => {
  vi.clearAllMocks();
  svc.requireOnboardedUser.mockResolvedValue({ id: "owner1", username: "ryan" });
  for (const fn of [svc.setJoinLinkEnabled, svc.setJoinLinkRole, svc.resetJoinLink]) {
    fn.mockResolvedValue({ ok: true, value: LINK });
  }
});

describe("join link actions", () => {
  it("turn on and off from the switch's value, as the signed-in user", async () => {
    await setJoinLinkEnabledAction("cb1", {}, form({ enabled: "true" }));
    await setJoinLinkEnabledAction("cb1", {}, form({ enabled: "false" }));
    // Anything but "true" is off: a missing field never turns a link on.
    await setJoinLinkEnabledAction("cb1", {}, form());

    expect(svc.setJoinLinkEnabled.mock.calls).toEqual([
      ["owner1", "cb1", true],
      ["owner1", "cb1", false],
      ["owner1", "cb1", false],
    ]);
  });

  it("pass the chosen role through, and reset takes nothing from the form", async () => {
    await setJoinLinkRoleAction("cb1", {}, form({ role: "EDITOR" }));
    await resetJoinLinkAction("cb1", {}, form({ cookbookId: "cb_other" }));

    expect(svc.setJoinLinkRole).toHaveBeenCalledWith("owner1", "cb1", "EDITOR");
    // The id is bound server-side; nothing in the form can retarget it.
    expect(svc.resetJoinLink).toHaveBeenCalledWith("owner1", "cb1");
  });

  it("hand back the saved link and refresh both places the panel shows", async () => {
    expect(await resetJoinLinkAction("cb1", {}, form())).toEqual({ link: LINK });
    expect(svc.revalidatePath).toHaveBeenCalledWith("/cookbooks/cb1");
    expect(svc.revalidatePath).toHaveBeenCalledWith("/cookbooks/cb1/members");
  });

  it.each([
    ["setJoinLinkEnabledAction", () => setJoinLinkEnabledAction("cb1", {}, form({ enabled: "true" })), svc.setJoinLinkEnabled],
    ["setJoinLinkRoleAction", () => setJoinLinkRoleAction("cb1", {}, form({ role: "OWNER" })), svc.setJoinLinkRole],
    ["resetJoinLinkAction", () => resetJoinLinkAction("cb1", {}, form()), svc.resetJoinLink],
  ])("%s reports a refusal and refreshes nothing", async (_name, run, service) => {
    service.mockResolvedValue({ ok: false, error: { kind: "forbidden", message: "Only the owner can." } });

    expect(await run()).toEqual({ error: "Only the owner can." });
    expect(svc.revalidatePath).not.toHaveBeenCalled();
  });

  it("let the auth gate's redirect propagate", async () => {
    svc.requireOnboardedUser.mockRejectedValue(new Error("REDIRECT:/sign-in"));

    await expect(resetJoinLinkAction("cb1", {}, form())).rejects.toThrow("REDIRECT:/sign-in");
    expect(svc.resetJoinLink).not.toHaveBeenCalled();
  });
});
