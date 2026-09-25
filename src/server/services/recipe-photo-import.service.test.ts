import { describe, it, expect, vi, beforeEach } from "vitest";
import { MAX_IMAGE_BYTES } from "@/lib/image-uploads";

const { findMembership, messagesParse, claim } = vi.hoisted(() => ({
  findMembership: vi.fn(),
  messagesParse: vi.fn(),
  claim: vi.fn(),
}));
vi.mock("@/server/repositories/cookbook.repository", () => ({
  cookbookRepository: { findMembership },
}));
vi.mock("@/server/repositories/ai-import.repository", () => ({
  aiImportRepository: { claim },
}));
vi.mock("@anthropic-ai/sdk", () => ({
  // A plain function, not an arrow — the service calls this with `new`, and
  // an arrow function can't be a constructor.
  default: vi.fn().mockImplementation(function AnthropicMock() {
    return { messages: { parse: messagesParse } };
  }),
}));

import { importFromPhoto } from "./recipe-photo-import.service";
import { AI_IMPORTS_PER_DAY } from "./recipe-extraction";

const jpeg = (bytes = "fake-jpeg-bytes") =>
  new File([bytes], "card.jpg", { type: "image/jpeg" });

const carbonaraFromPhoto = {
  title: "Weeknight Carbonara",
  description: "",
  servings: "2",
  prepTimeMinutes: "",
  cookTimeMinutes: "",
  ingredients: [{ name: "spaghetti", quantity: "200", unit: "g", note: "" }],
  steps: ["Boil the pasta."],
};

beforeEach(() => {
  vi.clearAllMocks();
  findMembership.mockResolvedValue({ role: "EDITOR" });
  messagesParse.mockResolvedValue({ parsed_output: carbonaraFromPhoto });
  claim.mockResolvedValue(true);
});

describe("who may import", () => {
  it.each([
    ["a non-member", null],
    ["a viewer", { role: "VIEWER" }],
  ])("refuses %s, and never calls Claude", async (_who, membership) => {
    findMembership.mockResolvedValue(membership);

    const result = await importFromPhoto("u1", "cb1", jpeg());

    expect(result).toMatchObject({ ok: false, error: { kind: "forbidden" } });
    expect(messagesParse).not.toHaveBeenCalled();
  });

  it("lets an editor import", async () => {
    const result = await importFromPhoto("u1", "cb1", jpeg());
    expect(result.ok).toBe(true);
  });
});

describe("importFromPhoto", () => {
  it("turns Claude's reading into form values, with no cover image", async () => {
    const result = await importFromPhoto("u1", "cb1", jpeg());

    expect(result).toEqual({
      ok: true,
      value: { ...carbonaraFromPhoto, coverImageUrl: "" },
    });
  });

  it("sends the photo as base64 alongside the extraction prompt", async () => {
    await importFromPhoto("u1", "cb1", jpeg("hello"));

    const request = messagesParse.mock.calls[0][0];
    const [imageBlock, textBlock] = request.messages[0].content;
    expect(imageBlock.source).toMatchObject({
      type: "base64",
      media_type: "image/jpeg",
      data: Buffer.from("hello").toString("base64"),
    });
    expect(textBlock.type).toBe("text");
  });

  it("rejects a non-JPEG file without calling Claude or spending an import", async () => {
    const file = new File(["x"], "card.png", { type: "image/png" });
    const result = await importFromPhoto("u1", "cb1", file);

    expect(result).toMatchObject({ ok: false, error: { kind: "invalid" } });
    expect(messagesParse).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
  });

  it("rejects an empty file without calling Claude", async () => {
    const file = new File([], "card.jpg", { type: "image/jpeg" });
    const result = await importFromPhoto("u1", "cb1", file);

    expect(result).toMatchObject({ ok: false, error: { kind: "invalid" } });
    expect(messagesParse).not.toHaveBeenCalled();
  });

  it("rejects a file over the size limit without calling Claude", async () => {
    const file = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "card.jpg", {
      type: "image/jpeg",
    });
    const result = await importFromPhoto("u1", "cb1", file);

    expect(result).toMatchObject({ ok: false, error: { kind: "invalid" } });
    expect(messagesParse).not.toHaveBeenCalled();
  });

  it("reports a failed request as unreachable rather than throwing", async () => {
    messagesParse.mockRejectedValue(new Error("network blip"));

    const result = await importFromPhoto("u1", "cb1", jpeg());

    expect(result).toMatchObject({ ok: false, error: { kind: "unreachable" } });
  });

  it("treats an empty reading as unparseable", async () => {
    messagesParse.mockResolvedValue({
      parsed_output: { ...carbonaraFromPhoto, ingredients: [], steps: [] },
    });

    const result = await importFromPhoto("u1", "cb1", jpeg());

    expect(result).toMatchObject({ ok: false, error: { kind: "unparseable" } });
  });

  it("treats a null parse (schema mismatch) as unparseable", async () => {
    messagesParse.mockResolvedValue({ parsed_output: null });

    const result = await importFromPhoto("u1", "cb1", jpeg());

    expect(result).toMatchObject({ ok: false, error: { kind: "unparseable" } });
  });
});

describe("the daily cap on AI imports", () => {
  const NOW = new Date("2026-09-25T12:00:00Z");

  it("spends one of this user's imports for the last 24 hours before asking Claude", async () => {
    await importFromPhoto("u1", "cb1", jpeg());

    expect(claim).toHaveBeenCalledWith("u1", AI_IMPORTS_PER_DAY, expect.any(Date));
    expect(claim.mock.invocationCallOrder[0]).toBeLessThan(
      messagesParse.mock.invocationCallOrder[0],
    );
  });

  it("counts from exactly a day ago", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    try {
      await importFromPhoto("u1", "cb1", jpeg());
    } finally {
      vi.useRealTimers();
    }

    expect(claim.mock.calls[0][2]).toEqual(new Date("2026-09-24T12:00:00Z"));
  });

  it("refuses once they're used up, without calling Claude, and points at the other ways in", async () => {
    claim.mockResolvedValue(false);

    const result = await importFromPhoto("u1", "cb1", jpeg());

    expect(result).toMatchObject({ ok: false, error: { kind: "limited" } });
    expect(!result.ok && result.error.message).toMatch(/paste a recipe/);
    expect(messagesParse).not.toHaveBeenCalled();
  });

  it("isn't spent by someone who may not import into the cookbook", async () => {
    findMembership.mockResolvedValue(null);

    await importFromPhoto("u1", "cb1", jpeg());

    expect(claim).not.toHaveBeenCalled();
  });
});
