import { describe, it, expect } from "vitest";
import { isAllowedUploadPath, uploadPathname } from "./image-uploads";

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
