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

  // Returning to where you signed in is never the point, and after sign-up it
  // put a fresh account back on the sign-in page.
  it.each([
    "/sign-in",
    "/sign-up",
    "/sign-in/factor-one?redirect_url=%2F",
    "/sign-up#verify",
    "http://localhost:8000/sign-in?redirect_url=http%3A%2F%2Flocalhost%3A8000%2F",
  ])("refuses the auth page %j", (path) =>
    expect(safeReturnPath(path)).toBeNull(),
  );

  it("still accepts a page whose path merely starts the same way", () => {
    expect(safeReturnPath("/sign-in-help")).toBe("/sign-in-help");
  });

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
