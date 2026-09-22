import { describe, it, expect } from "vitest";
import { storedImageUrlSchema } from "./stored-image-url";

const BLOB = "https://abc123.public.blob.vercel-storage.com/cookbook-covers/x.jpg";

describe("storedImageUrlSchema", () => {
  it("accepts a blob URL", () => {
    expect(storedImageUrlSchema.parse(BLOB)).toBe(BLOB);
  });

  // "" is what an untouched form field sends, and it has to mean "no image"
  // rather than an invalid URL.
  it("turns an empty field into undefined, so it stores as null", () => {
    expect(storedImageUrlSchema.parse("")).toBeUndefined();
    expect(storedImageUrlSchema.parse("   ")).toBeUndefined();
  });

  it("rejects a URL from anywhere else", () => {
    expect(storedImageUrlSchema.safeParse("https://evil.example.com/x.jpg").success).toBe(false);
  });
});
