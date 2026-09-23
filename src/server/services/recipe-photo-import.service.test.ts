import { describe, it, expect, vi, beforeEach } from "vitest";
import { MAX_IMAGE_BYTES } from "@/lib/image-uploads";

const { findMembership, messagesParse } = vi.hoisted(() => ({
  findMembership: vi.fn(),
  messagesParse: vi.fn(),
}));
vi.mock("@/server/repositories/cookbook.repository", () => ({
  cookbookRepository: { findMembership },
}));
vi.mock("@anthropic-ai/sdk", () => ({
  // A plain function, not an arrow — the service calls this with `new`, and
  // an arrow function can't be a constructor.
  default: vi.fn().mockImplementation(function AnthropicMock() {
    return { messages: { parse: messagesParse } };
  }),
}));

import { importFromPhoto } from "./recipe-photo-import.service";

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

  it("rejects a non-JPEG file without calling Claude", async () => {
    const file = new File(["x"], "card.png", { type: "image/png" });
    const result = await importFromPhoto("u1", "cb1", file);

    expect(result).toMatchObject({ ok: false, error: { kind: "invalid" } });
    expect(messagesParse).not.toHaveBeenCalled();
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
