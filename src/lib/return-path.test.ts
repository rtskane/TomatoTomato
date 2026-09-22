import { describe, it, expect } from "vitest";
import { afterSignUpPath, safeReturnPath } from "./return-path";

describe("safeReturnPath", () => {
  it.each(["/join/abc_123-XYZ", "/dashboard", "/cookbooks/cb1?tab=recipes"])(
    "accepts a path on this site: %s",
    (path) => expect(safeReturnPath(path)).toBe(path),
  );

  // Clerk's buttons pass the page they were on as a full URL.
  it("keeps only the path of a full URL, so it can't leave the site", () => {
    expect(safeReturnPath("http://localhost:8000/join/abc?x=1")).toBe("/join/abc?x=1");
    expect(safeReturnPath("https://evil.example.com/join/abc")).toBe("/join/abc");
    expect(safeReturnPath("https://evil.example.com")).toBe("/");
  });

  // Each of these, followed blindly, would send someone to another host.
  it.each([
    "https://evil.example.com//other.example.com",
    "//evil.example.com",
    "/\\evil.example.com",
    "/\t/evil.example.com",
    "/\n/evil.example.com",
    "javascript:alert(1)",
    "join/abc",
    "",
  ])("refuses %j", (path) => expect(safeReturnPath(path)).toBeNull());

  it("refuses anything that isn't a single string", () => {
    expect(safeReturnPath(undefined)).toBeNull();
    expect(safeReturnPath(["/join/a", "/join/b"])).toBeNull();
  });
});

describe("afterSignUpPath", () => {
  it("sends a new account through onboarding, then on to where they were going", () => {
    expect(afterSignUpPath("/join/abc")).toBe("/onboarding?next=%2Fjoin%2Fabc");
  });

  it("sends them to onboarding alone when they weren't going anywhere", () => {
    expect(afterSignUpPath(null)).toBe("/onboarding");
  });
});
