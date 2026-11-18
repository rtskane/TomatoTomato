import { describe, it, expect } from "vitest";
import {
  SETUP_STEPS,
  SETUP_STEP_COUNT,
  setupPath,
  stepNumber,
} from "./setup-steps";

describe("the setup flow", () => {
  it("is name and cover together, then invite", () => {
    expect(SETUP_STEPS.map((s) => s.key)).toEqual(["cover", "invite"]);
  });

  it("numbers the steps from one, for saying out loud", () => {
    expect(stepNumber("cover")).toBe(1);
    expect(stepNumber("invite")).toBe(2);
    expect(SETUP_STEP_COUNT).toBe(2);
  });
});

describe("setupPath", () => {
  // The step after the cover hangs off a real cookbook id: by then the
  // cookbook exists, so the URL is a bookmarkable place rather than a
  // position in a session.
  it("addresses a step on a cookbook that already exists", () => {
    expect(setupPath("cb1", "invite")).toBe("/cookbooks/cb1/setup/invite");
  });
});
