// The shape of setting up a new cookbook: name it, dress it, fill it with
// people. Framework-free so the steps can be asserted in a unit test and
// referenced from both the pages and the actions that redirect between them.

export const SETUP_STEPS = [
  { key: "name", label: "Name", href: null },
  { key: "cover", label: "Cover", href: "cover" },
  { key: "invite", label: "Invite", href: "invite" },
] as const;

export type SetupStep = (typeof SETUP_STEPS)[number]["key"];

/**
 * Where a step lives.
 *
 * Every step after the first hangs off the cookbook's own id, which is the
 * physical expression of the rule that **the cookbook exists from step one**:
 * there is no route in this flow that can be reached without one, so there is
 * no half-made cookbook to lose. It is also what makes the flow resumable —
 * the URL is a real, bookmarkable place, not a position in a session.
 */
export function setupPath(cookbookId: string, step: Exclude<SetupStep, "name">) {
  return `/cookbooks/${cookbookId}/setup/${step}`;
}

/** 1-based, for "Step 2 of 3". */
export function stepNumber(step: SetupStep): number {
  return SETUP_STEPS.findIndex((s) => s.key === step) + 1;
}

export const SETUP_STEP_COUNT = SETUP_STEPS.length;
