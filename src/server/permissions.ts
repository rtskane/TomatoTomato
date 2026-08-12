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

/**
 * Change a recipe that already exists — both editing and deleting it.
 *
 * One predicate for both because they carry the same rule: you may modify a
 * recipe you wrote, and the owner may modify any of them. An EDITOR who didn't
 * write it cannot, which is the distinction `canAddRecipes` alone never drew —
 * before this, EDITOR and VIEWER differed only in whether they could create.
 *
 * Note this is deliberately narrower than `canAddRecipes`: being able to add
 * recipes to a cookbook doesn't imply being able to rewrite everyone else's.
 */
export function canModifyRecipe(
  role: CookbookRole,
  isAuthor: boolean,
): boolean {
  if (role === "OWNER") return true;
  return role === "EDITOR" && isAuthor;
}

/**
 * Rename a cookbook, change its description, archive it, or restore it.
 *
 * Owner-only: the title is how members find a cookbook they agreed to join, and
 * archiving hides it from all of them at once. Same holder as
 * `canManageMembers`, but kept separate so the two can diverge without one
 * silently widening the other.
 */
export function canEditCookbook(role: CookbookRole): boolean {
  return role === "OWNER";
}
