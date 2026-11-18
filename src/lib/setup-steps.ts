// The shape of setting up a new cookbook: name it and dress it, then fill it
// with people. Framework-free so the steps can be asserted in a unit test and
// referenced from both the pages and the actions that move between them.

export const SETUP_STEPS = [
  { key: "cover", label: "Name and cover" },
  { key: "invite", label: "Invite" },
] as const;

export type SetupStep = (typeof SETUP_STEPS)[number]["key"];

/**
 * Where a step that belongs to a cookbook lives.
 *
 * The first step has no address of its own beyond /cookbooks/new, because
 * there is no cookbook yet: the name and the cover are chosen together, on
 * one screen, and the cookbook is created when both are settled. (What is in
 * flight until then is kept in the browser — see lib/cookbook-draft.ts — so
 * closing the tab loses nothing.)
 *
 * Everything after that hangs off the cookbook's own id, which makes it a
 * real, bookmarkable place rather than a position in a session.
 */
export function setupPath(cookbookId: string, step: Exclude<SetupStep, "cover">) {
  return `/cookbooks/${cookbookId}/setup/${step}`;
}

/** 1-based, for "Step 2 of 2". */
export function stepNumber(step: SetupStep): number {
  return SETUP_STEPS.findIndex((s) => s.key === step) + 1;
}

export const SETUP_STEP_COUNT = SETUP_STEPS.length;
