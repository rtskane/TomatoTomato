import { describe, it, expect, vi, beforeEach } from "vitest";

const { ensureUser, handleUpload } = vi.hoisted(() => ({
  ensureUser: vi.fn(),
  handleUpload: vi.fn(),
}));
vi.mock("@/lib/user", () => ({ ensureUser }));
vi.mock("@vercel/blob/client", () => ({ handleUpload }));

import { POST } from "./route";

const request = () =>
  new Request("http://localhost/api/images", {
    method: "POST",
    body: JSON.stringify({ type: "blob.generate-client-token" }),
  });

/** Make the SDK ask our callback about a pathname, as it does for real. */
function sdkAsksAbout(pathname: string) {
  handleUpload.mockImplementation(
    async ({ onBeforeGenerateToken }: { onBeforeGenerateToken: (p: string) => Promise<unknown> }) => ({
      token: await onBeforeGenerateToken(pathname),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  ensureUser.mockResolvedValue({ id: "u1", username: "chef" });
});

describe("POST /api/images", () => {
  it("refuses anyone not signed in and onboarded, before the SDK runs", async () => {
    ensureUser.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);

    ensureUser.mockResolvedValue({ id: "u1", username: null });
    expect((await POST(request())).status).toBe(401);

    expect(handleUpload).not.toHaveBeenCalled();
  });

  it.each(["cookbook-covers/a.jpg", "recipe-photos/dinner.jpg"])(
    "issues a token for %s, limited to images of 8 MB",
    async (pathname) => {
      sdkAsksAbout(pathname);

      const response = await POST(request());

      expect(response.status).toBe(200);
      expect((await response.json()).token).toMatchObject({
        allowedContentTypes: expect.arrayContaining(["image/jpeg"]),
        maximumSizeInBytes: 8 * 1024 * 1024,
        addRandomSuffix: true,
      });
    },
  );

  it("refuses a path outside our folders", async () => {
    sdkAsksAbout("somewhere-else/x.jpg");

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Unexpected upload path." });
  });
});
