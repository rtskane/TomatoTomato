import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { verifyWebhook, findByClerkId, removeAccountData } = vi.hoisted(() => ({
  verifyWebhook: vi.fn(),
  findByClerkId: vi.fn(),
  removeAccountData: vi.fn(),
}));
vi.mock("@clerk/nextjs/webhooks", () => ({ verifyWebhook }));
vi.mock("@/server/repositories/user.repository", () => ({
  userRepository: { findByClerkId },
}));
vi.mock("@/lib/account", () => ({ removeAccountData }));

import { POST } from "./route";

const request = {} as NextRequest;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/webhooks/clerk", () => {
  it("refuses anything without a valid signature, before reading it", async () => {
    verifyWebhook.mockRejectedValue(new Error("bad signature"));

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(findByClerkId).not.toHaveBeenCalled();
    expect(removeAccountData).not.toHaveBeenCalled();
  });

  // Nobody asked them, so their shared recipes stay, unattributed.
  it("deletes a deleted user's data, keeping their shared recipes", async () => {
    verifyWebhook.mockResolvedValue({ type: "user.deleted", data: { id: "clerk_1" } });
    findByClerkId.mockResolvedValue({ id: "u1" });

    const response = await POST(request);

    expect(response.status).toBe(204);
    expect(findByClerkId).toHaveBeenCalledWith("clerk_1");
    expect(removeAccountData).toHaveBeenCalledWith("u1", { keepRecipes: true });
  });

  it("does nothing for someone we hold nothing for", async () => {
    verifyWebhook.mockResolvedValue({ type: "user.deleted", data: { id: "clerk_1" } });
    findByClerkId.mockResolvedValue(null);

    expect((await POST(request)).status).toBe(204);
    expect(removeAccountData).not.toHaveBeenCalled();
  });

  it("ignores other events", async () => {
    verifyWebhook.mockResolvedValue({ type: "user.updated", data: { id: "clerk_1" } });

    expect((await POST(request)).status).toBe(204);
    expect(findByClerkId).not.toHaveBeenCalled();
  });
});
