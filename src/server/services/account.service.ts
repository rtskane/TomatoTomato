import { displayName } from "@/lib/display-name";
import {
  accountRepository,
  type AccountDeletion,
} from "@/server/repositories/account.repository";
import type { CookbookRole } from "@/generated/prisma/enums";

// Deleting an account. Framework-free — Clerk and blob storage are the
// caller's business — so the rules below are unit-testable directly.
//
// The rules, as decided for v1:
//   - A cookbook they own that nobody else is in is deleted, with everything
//     in it.
//   - A cookbook they own that others are in is handed on, to whoever has been
//     an editor longest, or failing that whoever has been in it longest. The
//     other members' recipes are theirs, and survive.
//   - Their recipes in cookbooks that survive are deleted or kept as they
//     choose. Kept ones stay for the cookbook's members, credited to "a former
//     member" — nothing links them back to the person.
//   - Everything else that names them (memberships, links they made, their AI
//     import count, the user row itself) goes.

type Footprint = NonNullable<
  Awaited<ReturnType<typeof accountRepository.findFootprint>>
>;
type OwnedCookbook = Footprint["ownedCookbooks"][number];
type OtherMember = OwnedCookbook["members"][number];

/**
 * Who a cookbook passes to: the longest-standing editor, since they already
 * write in it, or else the longest-standing member of any role. `members` is
 * earliest first and excludes the leaving owner. Null when nobody's left.
 */
export function chooseHeir(members: OtherMember[]): OtherMember | null {
  return members.find((m) => m.role === "EDITOR") ?? members[0] ?? null;
}

export type AccountDeletionPlan = AccountDeletion & {
  /** Files nothing will point at once the deletion is done. */
  orphanedImages: (string | null)[];
};

/** Turn what an account touches into exactly what to change. Pure. */
export function planAccountDeletion(
  footprint: Footprint,
  keepRecipes: boolean,
): AccountDeletionPlan {
  const transfers: AccountDeletionPlan["transfers"] = [];
  const deleteCookbookIds: string[] = [];
  const orphanedImages: (string | null)[] = [];

  for (const cookbook of footprint.ownedCookbooks) {
    const heir = chooseHeir(cookbook.members);
    if (heir) {
      transfers.push({ cookbookId: cookbook.id, heirId: heir.userId });
    } else {
      deleteCookbookIds.push(cookbook.id);
      orphanedImages.push(
        cookbook.coverImageUrl,
        ...cookbook.recipes.map((r) => r.coverImageUrl),
      );
    }
  }

  // Recipes inside a deleted cookbook go with it; only the rest are a choice.
  const deleted = new Set(deleteCookbookIds);
  const recipesElsewhere = footprint.recipes.filter(
    (r) => !deleted.has(r.cookbookId),
  );
  const deleteRecipeIds = keepRecipes ? [] : recipesElsewhere.map((r) => r.id);
  if (!keepRecipes) {
    orphanedImages.push(...recipesElsewhere.map((r) => r.coverImageUrl));
  }

  return {
    userId: footprint.id,
    transfers,
    deleteCookbookIds,
    deleteRecipeIds,
    orphanedImages: orphanedImages.filter(Boolean),
  };
}

export type AccountDeletionPreview = {
  /** Cookbooks that will pass to someone else, and to whom. */
  handedOver: { title: string; to: string; toRole: CookbookRole }[];
  /** Cookbooks only they are in, which will be deleted. */
  deleted: { title: string }[];
  /** Their recipes in cookbooks that will survive — the ones they choose about. */
  recipesElsewhere: number;
};

/** What deleting this account would do, for the confirmation dialog. */
export async function getAccountDeletionPreview(
  userId: string,
): Promise<AccountDeletionPreview | null> {
  const footprint = await accountRepository.findFootprint(userId);
  if (!footprint) return null;

  const plan = planAccountDeletion(footprint, true);
  const deleted = new Set(plan.deleteCookbookIds);

  return {
    handedOver: footprint.ownedCookbooks.flatMap((cookbook) => {
      const heir = chooseHeir(cookbook.members);
      return heir
        ? [{ title: cookbook.title, to: displayName(heir.user), toRole: heir.role }]
        : [];
    }),
    deleted: footprint.ownedCookbooks
      .filter((c) => deleted.has(c.id))
      .map((c) => ({ title: c.title })),
    recipesElsewhere: footprint.recipes.filter((r) => !deleted.has(r.cookbookId))
      .length,
  };
}

/**
 * Delete an account's data. Returns the images left orphaned, for the caller to
 * remove from blob storage once the database write has succeeded. An account
 * that's already gone is not an error — the webhook and the dialog can both
 * arrive for the same person.
 */
export async function deleteAccount(
  userId: string,
  { keepRecipes }: { keepRecipes: boolean },
): Promise<{ orphanedImages: (string | null)[] }> {
  const footprint = await accountRepository.findFootprint(userId);
  if (!footprint) return { orphanedImages: [] };

  const { orphanedImages, ...deletion } = planAccountDeletion(
    footprint,
    keepRecipes,
  );
  await accountRepository.deleteAccount(deletion);
  return { orphanedImages };
}
