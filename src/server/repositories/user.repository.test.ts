import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Prisma boundary so we assert *how* the repository calls it and how
// it translates errors — without a database. vi.hoisted lets the mock factory
// (which is hoisted above imports) reference these safely.
const { user } = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: { user } }));

import { userRepository, UsernameTakenError } from "./user.repository";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("userRepository.findByClerkId", () => {
  it("queries by clerkId", async () => {
    user.findUnique.mockResolvedValue({ id: "u1" });
    await userRepository.findByClerkId("clerk_1");
    expect(user.findUnique).toHaveBeenCalledWith({
      where: { clerkId: "clerk_1" },
    });
  });
});

describe("userRepository.upsertFromClerk", () => {
  it("only writes Clerk-owned fields (never username/firstName/lastName)", async () => {
    user.upsert.mockResolvedValue({ id: "u1" });

    await userRepository.upsertFromClerk({
      clerkId: "clerk_1",
      email: "ryan@example.com",
      avatarUrl: null,
    });

    const arg = user.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ clerkId: "clerk_1" });
    expect(arg.update).toEqual({ email: "ryan@example.com", avatarUrl: null });
    expect(arg.create).toEqual({
      clerkId: "clerk_1",
      email: "ryan@example.com",
      avatarUrl: null,
    });
    // Guard the invariant explicitly.
    expect(arg.update).not.toHaveProperty("username");
    expect(arg.create).not.toHaveProperty("username");
  });
});

describe("userRepository.setProfile", () => {
  const input = {
    clerkId: "clerk_1",
    username: "chef_ryan",
    firstName: "Ryan",
    lastName: null,
  };

  it("updates the profile fields for the user", async () => {
    user.update.mockResolvedValue({ id: "u1", username: "chef_ryan" });

    await userRepository.setProfile(input);

    expect(user.update).toHaveBeenCalledWith({
      where: { clerkId: "clerk_1" },
      data: { username: "chef_ryan", firstName: "Ryan", lastName: null },
    });
  });

  it("translates a P2002 unique violation into UsernameTakenError", async () => {
    user.update.mockRejectedValue({ code: "P2002" });

    await expect(userRepository.setProfile(input)).rejects.toBeInstanceOf(
      UsernameTakenError,
    );
  });

  it("rethrows unexpected errors unchanged", async () => {
    const boom = new Error("connection lost");
    user.update.mockRejectedValue(boom);

    await expect(userRepository.setProfile(input)).rejects.toBe(boom);
  });
});
