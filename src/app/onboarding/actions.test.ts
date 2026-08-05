import { describe, it, expect, vi, beforeEach } from "vitest";

const { auth, redirect, ensureUser, onboardUser } = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  ensureUser: vi.fn(),
  onboardUser: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/user", () => ({ ensureUser }));
vi.mock("@/server/services/onboarding.service", () => ({ onboardUser }));

import { completeOnboarding } from "./actions";

function formOf(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("completeOnboarding", () => {
  it("redirects to /sign-in when unauthenticated", async () => {
    auth.mockResolvedValue({ userId: null });

    await expect(
      completeOnboarding({}, formOf({ username: "chef_ryan" })),
    ).rejects.toThrow("REDIRECT:/sign-in");
    expect(onboardUser).not.toHaveBeenCalled();
  });

  it("ensures the local row exists, then calls the service with form values", async () => {
    auth.mockResolvedValue({ userId: "clerk_1" });
    ensureUser.mockResolvedValue({ id: "u1" });
    onboardUser.mockResolvedValue({ ok: true, value: { username: "chef_ryan" } });

    await expect(
      completeOnboarding(
        {},
        formOf({ username: "chef_ryan", firstName: "Ryan", lastName: "K" }),
      ),
    ).rejects.toThrow("REDIRECT:/dashboard");

    expect(ensureUser).toHaveBeenCalledOnce();
    expect(onboardUser).toHaveBeenCalledWith("clerk_1", {
      username: "chef_ryan",
      firstName: "Ryan",
      lastName: "K",
    });
  });

  it("returns error state (no redirect) when the service reports a failure", async () => {
    auth.mockResolvedValue({ userId: "clerk_1" });
    ensureUser.mockResolvedValue({ id: "u1" });
    onboardUser.mockResolvedValue({
      ok: false,
      error: { kind: "username_taken", message: "That username is already taken." },
    });

    const values = { username: "taken", firstName: "", lastName: "" };
    const result = await completeOnboarding({}, formOf(values));

    expect(result).toEqual({
      error: "That username is already taken.",
      values,
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects to /dashboard on success", async () => {
    auth.mockResolvedValue({ userId: "clerk_1" });
    ensureUser.mockResolvedValue({ id: "u1" });
    onboardUser.mockResolvedValue({ ok: true, value: { username: "chef_ryan" } });

    await expect(
      completeOnboarding({}, formOf({ username: "chef_ryan" })),
    ).rejects.toThrow("REDIRECT:/dashboard");
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });
});
