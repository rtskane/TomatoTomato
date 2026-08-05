import { describe, it, expect, vi, beforeEach } from "vitest";

// Fully replace the repository module (so real Prisma is never imported). The
// service checks `instanceof UsernameTakenError`; because both the service and
// this test import that class from the same mocked module, the identity matches.
const { setProfile, UsernameTakenError } = vi.hoisted(() => {
  class UsernameTakenError extends Error {
    constructor() {
      super("Username already taken");
      this.name = "UsernameTakenError";
    }
  }
  return { setProfile: vi.fn(), UsernameTakenError };
});
vi.mock("@/server/repositories/user.repository", () => ({
  userRepository: { setProfile },
  UsernameTakenError,
}));

import { onboardUser } from "./onboarding.service";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("onboardUser", () => {
  it("returns a validation error and does NOT touch the repository", async () => {
    const result = await onboardUser("clerk_1", {
      username: "ab", // too short
      firstName: "",
      lastName: "",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("validation");
    expect(setProfile).not.toHaveBeenCalled();
  });

  it("normalizes input and persists on the happy path", async () => {
    setProfile.mockResolvedValue({ id: "u1" });

    const result = await onboardUser("clerk_1", {
      username: "  ChefRyan ",
      firstName: " Ryan ",
      lastName: "",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.username).toBe("chefryan");
    expect(setProfile).toHaveBeenCalledWith({
      clerkId: "clerk_1",
      username: "chefryan",
      firstName: "Ryan",
      lastName: null, // empty string → null
    });
  });

  it("maps UsernameTakenError to a username_taken result", async () => {
    setProfile.mockRejectedValue(new UsernameTakenError());

    const result = await onboardUser("clerk_1", {
      username: "chef_ryan",
      firstName: "",
      lastName: "",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("username_taken");
  });

  it("rethrows unexpected repository errors", async () => {
    setProfile.mockRejectedValue(new Error("connection lost"));

    await expect(
      onboardUser("clerk_1", { username: "chef_ryan", firstName: "", lastName: "" }),
    ).rejects.toThrow("connection lost");
  });
});
