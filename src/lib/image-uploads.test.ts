import { describe, it, expect } from "vitest";
import {
  isAllowedUploadPath,
  isStoredImageUrl,
  uploadPathname,
} from "./image-uploads";

describe("uploadPathname", () => {
  it("files an image under its folder, named safely", () => {
    expect(uploadPathname("recipe-photos", "My Dinner (1).JPG")).toBe(
      "recipe-photos/my-dinner-1-.jpg",
    );
  });

  it("still names a file whose name was nothing but unsafe characters", () => {
    expect(uploadPathname("cookbook-covers", "📷")).toBe("cookbook-covers/image");
  });
});

describe("isAllowedUploadPath", () => {
  it.each(["cookbook-covers/a.jpg", "recipe-photos/dinner.jpg"])(
    "allows %s",
    (path) => expect(isAllowedUploadPath(path)).toBe(true),
  );

  // The client names the file, so these are what a crafted request would try.
  it.each([
    "avatars/me.jpg",
    "recipe-photos/",
    "recipe-photos/../cookbook-covers/x.jpg",
    "recipe-photos/nested/x.jpg",
    "recipe-photosx/a.jpg",
    "/recipe-photos/a.jpg",
  ])("refuses %s", (path) => expect(isAllowedUploadPath(path)).toBe(false));
});

// An image URL is the one field a client can put anything in: the browser
// uploads the file itself and posts back whatever URL it likes. These tests are
// the guard on what may be stored.
const BLOB = "https://abc123.public.blob.vercel-storage.com/cookbook-covers/x.jpg";

describe("isStoredImageUrl", () => {
  it("accepts a URL from our blob store", () => {
    expect(isStoredImageUrl(BLOB)).toBe(true);
  });

  it("rejects any other host", () => {
    expect(isStoredImageUrl("https://evil.example.com/x.jpg")).toBe(false);
  });

  // The check is a suffix match, so a host that merely *ends* with ours after
  // an attacker-controlled prefix is the case worth pinning down.
  it("rejects a lookalike host that only ends with the blob domain", () => {
    expect(
      isStoredImageUrl("https://public.blob.vercel-storage.com.evil.com/x.jpg"),
    ).toBe(false);
  });

  it("rejects the bare blob domain with no store id", () => {
    expect(isStoredImageUrl("https://public.blob.vercel-storage.com/x.jpg")).toBe(
      false,
    );
  });

  it("rejects plain http", () => {
    expect(
      isStoredImageUrl("http://abc.public.blob.vercel-storage.com/x.jpg"),
    ).toBe(false);
  });

  it("rejects non-http schemes", () => {
    expect(isStoredImageUrl("javascript:alert(1)")).toBe(false);
    expect(isStoredImageUrl("data:image/png;base64,AAAA")).toBe(false);
  });

  it("rejects text that isn't a URL at all", () => {
    expect(isStoredImageUrl("not a url")).toBe(false);
    expect(isStoredImageUrl("")).toBe(false);
  });
});
