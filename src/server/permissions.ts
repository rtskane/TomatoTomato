import type { CookbookRole } from "@/generated/prisma/enums";

// Role capabilities, in one place. The schema documents the intent:
//   OWNER  – can delete the cookbook and manage members
//   EDITOR – can add/edit their own recipes
//   VIEWER – read-only
// Keeping these as named predicates means call sites read as intent
// ("canAddRecipes") rather than as a role list that drifts out of sync.

export function canAddRecipes(role: CookbookRole): boolean {
  return role === "OWNER" || role === "EDITOR";
}

/**
 * Invite people, change their role, and remove them.
 *
 * Owner-only on purpose: an EDITOR can write recipes, but widening who can see
 * a cookbook is the owner's call. Note this is about *managing* membership —
 * every member can still see who else is in the cookbook.
 */
export function canManageMembers(role: CookbookRole): boolean {
  return role === "OWNER";
}
