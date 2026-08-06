import { describe, it, expect, vi, beforeEach } from "vitest";

// redirect() throws in Next to halt rendering — model that so control flow stops.
const { auth, currentUser, redirect, findByClerkId, upsertFromClerk } =
  vi.hoisted(() => ({
    auth: vi.fn(),
    currentUser: vi.fn(),
    redirect: vi.fn((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    }),
    findByClerkId: vi.fn(),
    upsertFromClerk: vi.fn(),
  }));
vi.mock("@clerk/nextjs/server", () => ({ auth, currentUser }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/server/repositories/user.repository", () => ({
  userRepository: { findByClerkId, upsertFromClerk },
}));

import { ensureUser, requireOnboardedUser } from "./user";

const clerkProfile = {
  id: "clerk_1",
  primaryEmailAddressId: "e2",
  emailAddresses: [
    { id: "e1", emailAddress: "old@example.com" },
    { id: "e2", emailAddress: "ryan@example.com" },
  ],
  imageUrl: "https://img/ryan.png",
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ userId: "clerk_1" });
});

// `updatedAt` is what the freshness check reads, so every stored row needs one.
const freshRow = (over: Record<string, unknown> = {}) => ({
  id: "u1",
  username: "chef",
  updatedAt: new Date(Date.now() - 60_000), // a minute old
  ...over,
});
const staleRow = (over: Record<string, unknown> = {}) => ({
  id: "u1",
  username: "chef",
  updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // two hours old
  ...over,
});

describe("ensureUser — warm path", () => {
  it("returns null when nobody is signed in", async () => {
    auth.mockResolvedValue({ userId: null });

    expect(await ensureUser()).toBeNull();
    expect(findByClerkId).not.toHaveBeenCalled();
    expect(upsertFromClerk).not.toHaveBeenCalled();
  });

  it("looks the row up by the id already in the session token", async () => {
    findByClerkId.mockResolvedValue(freshRow());

    const result = await ensureUser();

    expect(findByClerkId).toHaveBeenCalledWith("clerk_1");
    expect(result).toMatchObject({ id: "u1", username: "chef" });
  });

  // The whole point of the change: no outbound HTTPS call to Clerk on the
  // path every protected page view takes.
  it("never calls currentUser when the row is fresh", async () => {
    findByClerkId.mockResolvedValue(freshRow());

    await ensureUser();

    expect(currentUser).not.toHaveBeenCalled();
    expect(upsertFromClerk).not.toHaveBeenCalled();
  });
});

describe("ensureUser — refreshing a stale profile", () => {
  // Clerk owns email + avatar; without this the local copy would be frozen at
  // whatever it was when the row was first created.
  it("re-syncs from Clerk once the row is past the TTL", async () => {
    findByClerkId.mockResolvedValue(staleRow());
    currentUser.mockResolvedValue(clerkProfile);
    upsertFromClerk.mockResolvedValue(freshRow({ email: "new@example.com" }));

    const result = await ensureUser();

    expect(currentUser).toHaveBeenCalledOnce();
    expect(upsertFromClerk).toHaveBeenCalledWith({
      clerkId: "clerk_1",
      email: "ryan@example.com",
      avatarUrl: "https://img/ryan.png",
    });
    expect(result).toMatchObject({ email: "new@example.com" });
  });

  it("leaves a row just inside the TTL alone", async () => {
    findByClerkId.mockResolvedValue(
      freshRow({ updatedAt: new Date(Date.now() - 59 * 60 * 1000) }),
    );

    await ensureUser();

    expect(currentUser).not.toHaveBeenCalled();
  });

  // A Clerk outage shouldn't take down every page for users who already have a
  // perfectly usable row.
  it("falls back to the stored row when Clerk throws", async () => {
    const stored = staleRow();
    findByClerkId.mockResolvedValue(stored);
    currentUser.mockRejectedValue(new Error("clerk unreachable"));

    await expect(ensureUser()).resolves.toBe(stored);
  });

  it("falls back to the stored row when Clerk has no profile", async () => {
    const stored = staleRow();
    findByClerkId.mockResolvedValue(stored);
    currentUser.mockResolvedValue(null);

    await expect(ensureUser()).resolves.toBe(stored);
  });

  // The refresh must not touch onboarding-owned fields.
  it("only writes Clerk-owned fields on refresh", async () => {
    findByClerkId.mockResolvedValue(staleRow());
    currentUser.mockResolvedValue(clerkProfile);
    upsertFromClerk.mockResolvedValue(freshRow());

    await ensureUser();

    const written = upsertFromClerk.mock.calls[0][0];
    expect(written).not.toHaveProperty("username");
    expect(written).not.toHaveProperty("firstName");
  });
});

describe("ensureUser — cold path", () => {
  beforeEach(() => {
    findByClerkId.mockResolvedValue(null);
  });

  it("fetches the Clerk profile and creates the row on first sight", async () => {
    currentUser.mockResolvedValue(clerkProfile);
    upsertFromClerk.mockResolvedValue({ id: "u1", username: null });

    const result = await ensureUser();

    expect(currentUser).toHaveBeenCalledOnce();
    expect(upsertFromClerk).toHaveBeenCalledWith({
      clerkId: "clerk_1",
      email: "ryan@example.com", // the primary, not the first
      avatarUrl: "https://img/ryan.png",
    });
    expect(result).toEqual({ id: "u1", username: null });
  });

  it("falls back to null avatar when Clerk has no image", async () => {
    currentUser.mockResolvedValue({ ...clerkProfile, imageUrl: "" });
    upsertFromClerk.mockResolvedValue({ id: "u1" });

    await ensureUser();

    expect(upsertFromClerk.mock.calls[0][0].avatarUrl).toBeNull();
  });

  it("falls back to the first email when none is marked primary", async () => {
    currentUser.mockResolvedValue({
      ...clerkProfile,
      primaryEmailAddressId: null,
    });
    upsertFromClerk.mockResolvedValue({ id: "u1" });

    await ensureUser();

    expect(upsertFromClerk.mock.calls[0][0].email).toBe("old@example.com");
  });

  // Two concurrent first requests would otherwise race on the clerkId unique
  // constraint; upsert makes the loser a no-op instead of a 500.
  it("upserts rather than creates, so a concurrent first request can't clash", async () => {
    currentUser.mockResolvedValue(clerkProfile);
    upsertFromClerk.mockResolvedValue({ id: "u1" });

    await ensureUser();

    expect(upsertFromClerk).toHaveBeenCalledOnce();
  });

  it("returns null if Clerk has no profile for the session", async () => {
    currentUser.mockResolvedValue(null);

    expect(await ensureUser()).toBeNull();
    expect(upsertFromClerk).not.toHaveBeenCalled();
  });
});

describe("requireOnboardedUser", () => {
  it("redirects to /sign-in when not signed in", async () => {
    auth.mockResolvedValue({ userId: null });

    await expect(requireOnboardedUser()).rejects.toThrow("REDIRECT:/sign-in");
    expect(redirect).toHaveBeenCalledWith("/sign-in");
  });

  it("redirects to /onboarding when the user has no username", async () => {
    findByClerkId.mockResolvedValue(freshRow({ username: null }));

    await expect(requireOnboardedUser()).rejects.toThrow(
      "REDIRECT:/onboarding",
    );
    expect(redirect).toHaveBeenCalledWith("/onboarding");
  });

  it("returns the user when onboarding is complete", async () => {
    findByClerkId.mockResolvedValue(freshRow({ username: "chef_ryan" }));

    const user = await requireOnboardedUser();

    expect(user).toMatchObject({ username: "chef_ryan" });
    expect(redirect).not.toHaveBeenCalled();
  });

  // A brand-new user hits sign-up -> dashboard before any row exists; the gate
  // has to create it and then send them to onboarding, not to sign-in.
  it("creates the row then sends a brand-new user to onboarding", async () => {
    findByClerkId.mockResolvedValue(null);
    currentUser.mockResolvedValue(clerkProfile);
    upsertFromClerk.mockResolvedValue({ id: "u1", username: null });

    await expect(requireOnboardedUser()).rejects.toThrow(
      "REDIRECT:/onboarding",
    );
  });
});
