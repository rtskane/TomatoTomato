import { describe, it, expect } from "vitest";
import {
  SETUP_STEPS,
  SETUP_STEP_COUNT,
  setupPath,
  stepNumber,
} from "./setup-steps";

describe("the setup flow", () => {
  it("is name, then cover, then invite", () => {
    expect(SETUP_STEPS.map((s) => s.key)).toEqual(["name", "cover", "invite"]);
  });

  it("numbers the steps from one, for saying out loud", () => {
    expect(stepNumber("name")).toBe(1);
    expect(stepNumber("cover")).toBe(2);
    expect(stepNumber("invite")).toBe(3);
    expect(SETUP_STEP_COUNT).toBe(3);
  });
});

describe("setupPath", () => {
  // Every step after naming hangs off a real cookbook id, which is the
  // physical expression of "the cookbook exists from step one" — there is no
  // route in the flow reachable without one, so there is no half-made cookbook
  // that closing the tab could lose.
  it("addresses a step on a cookbook that already exists", () => {
    expect(setupPath("cb1", "cover")).toBe("/cookbooks/cb1/setup/cover");
    expect(setupPath("cb1", "invite")).toBe("/cookbooks/cb1/setup/invite");
  });

  // Which is also what makes the flow resumable: the URL is a bookmarkable
  // place rather than a position in a session.
  it("gives the same step the same address every time", () => {
    expect(setupPath("cb9", "cover")).toBe(setupPath("cb9", "cover"));
  });
});
