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
