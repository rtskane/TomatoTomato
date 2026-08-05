import { describe, it, expect, vi, beforeEach } from "vitest";

// redirect() throws in Next to halt rendering — model that so control flow stops.
const { currentUser, redirect, upsertFromClerk } = vi.hoisted(() => ({
  currentUser: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  upsertFromClerk: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ currentUser }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/server/repositories/user.repository", () => ({
  userRepository: { upsertFromClerk },
}));

import { ensureUser, requireOnboardedUser } from "./user";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ensureUser", () => {
  it("returns null when nobody is signed in", async () => {
    currentUser.mockResolvedValue(null);
    expect(await ensureUser()).toBeNull();
    expect(upsertFromClerk).not.toHaveBeenCalled();
  });

  it("syncs the primary email + avatar and returns the row", async () => {
    currentUser.mockResolvedValue({
      id: "clerk_1",
      primaryEmailAddressId: "e2",
      emailAddresses: [
        { id: "e1", emailAddress: "old@example.com" },
        { id: "e2", emailAddress: "ryan@example.com" },
      ],
      imageUrl: "https://img/ryan.png",
    });
    upsertFromClerk.mockResolvedValue({ id: "u1", username: "chef" });

    const result = await ensureUser();

    expect(upsertFromClerk).toHaveBeenCalledWith({
      clerkId: "clerk_1",
      email: "ryan@example.com",
      avatarUrl: "https://img/ryan.png",
    });
    expect(result).toEqual({ id: "u1", username: "chef" });
  });

  it("falls back to null avatar when Clerk has no image", async () => {
    currentUser.mockResolvedValue({
      id: "clerk_1",
      primaryEmailAddressId: "e1",
      emailAddresses: [{ id: "e1", emailAddress: "ryan@example.com" }],
      imageUrl: "",
    });
    upsertFromClerk.mockResolvedValue({ id: "u1" });

    await ensureUser();
    expect(upsertFromClerk.mock.calls[0][0].avatarUrl).toBeNull();
  });
});

describe("requireOnboardedUser", () => {
  function signedInWith(row: { username: string | null } | null) {
    if (row === null) {
      currentUser.mockResolvedValue(null);
    } else {
      currentUser.mockResolvedValue({
        id: "clerk_1",
        primaryEmailAddressId: "e1",
        emailAddresses: [{ id: "e1", emailAddress: "ryan@example.com" }],
        imageUrl: "",
      });
      upsertFromClerk.mockResolvedValue({ id: "u1", ...row });
    }
  }

  it("redirects to /sign-in when not signed in", async () => {
    signedInWith(null);
    await expect(requireOnboardedUser()).rejects.toThrow("REDIRECT:/sign-in");
    expect(redirect).toHaveBeenCalledWith("/sign-in");
  });

  it("redirects to /onboarding when the user has no username", async () => {
    signedInWith({ username: null });
    await expect(requireOnboardedUser()).rejects.toThrow(
      "REDIRECT:/onboarding",
    );
    expect(redirect).toHaveBeenCalledWith("/onboarding");
  });

  it("returns the user when onboarding is complete", async () => {
    signedInWith({ username: "chef_ryan" });
    const user = await requireOnboardedUser();
    expect(user).toMatchObject({ username: "chef_ryan" });
    expect(redirect).not.toHaveBeenCalled();
  });
});
