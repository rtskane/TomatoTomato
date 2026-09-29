import { describe, it, expect } from "vitest";
import { authorName, displayName } from "./display-name";

const person = { username: "chef", firstName: "Ann", lastName: "Lee" };

describe("displayName", () => {
  it("prefers the handle", () => {
    expect(displayName(person)).toBe("chef");
  });

  it("falls back to a real name, then to something neutral", () => {
    expect(displayName({ ...person, username: null })).toBe("Ann Lee");
    expect(
      displayName({ username: null, firstName: null, lastName: null }),
    ).toBe("Unknown");
  });
});

describe("authorName", () => {
  it("names a current author the way displayName does", () => {
    expect(authorName(person)).toBe("chef");
  });

  // Their account is gone and they left the recipe behind.
  it("credits a recipe with no author to a former member", () => {
    expect(authorName(null)).toBe("a former member");
  });
});
