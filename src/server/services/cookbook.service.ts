import { createCookbookSchema } from "@/lib/cookbook";
import { cookbookRepository } from "@/server/repositories/cookbook.repository";
import { ok, err, type Result } from "@/server/result";
import { recipeRepository } from "@/server/repositories/recipe.repository";
import { canAddRecipes, canEditCookbook } from "@/server/permissions";
import { displayName } from "@/lib/display-name";
import type { CookbookRole } from "@/generated/prisma/enums";

// Business logic for cookbooks. Framework-free — no next/*, no @clerk/* — so it
// can be unit-tested by calling createCookbook(userId, input) directly. The
// caller (the Server Action) owns auth and redirects.

export type CreateCookbookInput = {
  title: string;
  description: string;
};

// Only validation can fail in an *expected* way here: titles aren't unique, so
// there is no equivalent of the username collision case.
export type CookbookError = { kind: "validation"; message: string };

/**
 * `userId` is our internal `User.id`, not a Clerk id — it becomes the
 * `Cookbook.ownerId` foreign key. (Note the asymmetry with onboardUser, which
 * takes a clerkId because it looks the user up rather than referencing them.)
 */
export async function createCookbook(
  userId: string,
  input: CreateCookbookInput,
): Promise<Result<{ id: string }, CookbookError>> {
  const parsed = createCookbookSchema.safeParse(input);
  if (!parsed.success) {
    const message =
      parsed.error.issues[0]?.message ?? "Please check your input.";
    return err({ kind: "validation", message });
  }

  const cookbook = await cookbookRepository.create({
    ownerId: userId,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
  });

  return ok({ id: cookbook.id });
}

/**
 * The shape the dashboard renders. Flattened on purpose: the view never sees
 * the `membership.cookbook._count` nesting, so changing the query shape doesn't
 * ripple into JSX.
 */
export type CookbookSummary = {
  id: string;
  title: string;
  description: string | null;
  role: CookbookRole;
  recipeCount: number;
  memberCount: number;
};

/**
 * List every cookbook the user belongs to. Read-only, so there are no expected
 * failures to model — no `Result` here, just the rows (an empty array when the
 * user has none, never null).
 */
export async function listUserCookbooks(
  userId: string,
): Promise<CookbookSummary[]> {
  const memberships = await cookbookRepository.listForUser(userId);

  return memberships.map(({ role, cookbook }) => ({
    id: cookbook.id,
    title: cookbook.title,
    description: cookbook.description,
    role,
    recipeCount: cookbook._count.recipes,
    memberCount: cookbook._count.members,
  }));
}

export type RecipeSummary = {
  id: string;
  title: string;
  description: string | null;
  servings: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  authorName: string;
  ingredientCount: number;
  stepCount: number;
};

export type CookbookDetail = {
  id: string;
  title: string;
  description: string | null;
  role: CookbookRole;
  canAddRecipes: boolean;
  canEditCookbook: boolean;
  recipes: RecipeSummary[];
};

/**
 * One cookbook and its recipes, or `null` when the user isn't a member — which
 * the caller should surface as a 404, not a 403: whether a cookbook exists is
 * itself information a non-member shouldn't get.
 */
export async function getCookbookDetail(
  userId: string,
  cookbookId: string,
): Promise<CookbookDetail | null> {
  const membership = await cookbookRepository.findDetailForUser(
    cookbookId,
    userId,
  );
  if (!membership) return null;

  const { role, cookbook } = membership;

  return {
    id: cookbook.id,
    title: cookbook.title,
    description: cookbook.description,
    role,
    canAddRecipes: canAddRecipes(role),
    canEditCookbook: canEditCookbook(role),
    recipes: cookbook.recipes.map((recipe) => ({
      id: recipe.id,
      title: recipe.title,
      description: recipe.description,
      servings: recipe.servings,
      prepTimeMinutes: recipe.prepTimeMinutes,
      cookTimeMinutes: recipe.cookTimeMinutes,
      authorName: displayName(recipe.author),
      ingredientCount: recipe._count.ingredients,
      stepCount: recipe._count.steps,
    })),
  };
}

// ---------------------------------------------------------------------------
// Editing, archiving, restoring
// ---------------------------------------------------------------------------

export type CookbookAdminError =
  | { kind: "forbidden"; message: string }
  | { kind: "validation"; message: string };

const NOT_YOURS: CookbookAdminError = {
  kind: "forbidden",
  message: "Only the owner can change this cookbook.",
};

/** Confirm the caller owns this cookbook (and that it's still live). */
async function requireOwner(
  userId: string,
  cookbookId: string,
): Promise<Result<true, CookbookAdminError>> {
  const membership = await cookbookRepository.findMembership(cookbookId, userId);
  if (!membership || !canEditCookbook(membership.role)) return err(NOT_YOURS);
  return ok(true);
}

/** Rename a cookbook or change its description. Reuses the create validation. */
export async function updateCookbook(
  userId: string,
  cookbookId: string,
  input: CreateCookbookInput,
): Promise<Result<{ id: string }, CookbookAdminError>> {
  const allowed = await requireOwner(userId, cookbookId);
  if (!allowed.ok) return allowed;

  const parsed = createCookbookSchema.safeParse(input);
  if (!parsed.success) {
    const message =
      parsed.error.issues[0]?.message ?? "Please check your input.";
    return err({ kind: "validation", message });
  }

  await cookbookRepository.update(cookbookId, {
    title: parsed.data.title,
    description: parsed.data.description ?? null,
  });

  return ok({ id: cookbookId });
}

/**
 * What an archive confirmation needs to say out loud.
 *
 * `recipesByOthers` is the number that matters: archiving your own scratch
 * cookbook is nothing, archiving one holding five people's recipes is not, and
 * the dialog shouldn't flatten the difference.
 */
export type ArchiveImpact = {
  title: string;
  recipeCount: number;
  recipesByOthers: number;
  memberCount: number;
};

export async function getArchiveImpact(
  userId: string,
  cookbookId: string,
): Promise<Result<ArchiveImpact, CookbookAdminError>> {
  const allowed = await requireOwner(userId, cookbookId);
  if (!allowed.ok) return allowed;

  // Counts, not rows: this dialog needs four numbers, and loading every recipe
  // with its author (and every member) to call `.length` on them would be a lot
  // of data fetched to be thrown away.
  const [cookbook, byOthers] = await Promise.all([
    cookbookRepository.findWithCounts(cookbookId),
    recipeRepository.countByOtherAuthors(cookbookId, userId),
  ]);
  if (!cookbook) return err(NOT_YOURS);

  return ok({
    title: cookbook.title,
    recipeCount: cookbook._count.recipes,
    recipesByOthers: byOthers,
    memberCount: cookbook._count.members,
  });
}

/**
 * Archive a cookbook: it leaves every member's library, including the owner's
 * main list, and only the owner can bring it back.
 *
 * Nothing is deleted, so nobody's recipes are destroyed — that's the entire
 * reason this isn't a delete.
 */
export async function archiveCookbook(
  userId: string,
  cookbookId: string,
): Promise<Result<true, CookbookAdminError>> {
  const allowed = await requireOwner(userId, cookbookId);
  if (!allowed.ok) return allowed;

  const { count } = await cookbookRepository.archive(cookbookId, userId);
  if (count === 0) return err(NOT_YOURS);
  return ok(true);
}

/**
 * Restore an archived cookbook. Deliberately does NOT go through
 * `requireOwner`: that reads `findMembership`, which filters archived
 * cookbooks out — so the only operation that must see an archived row can't
 * use the guard built to hide them. Ownership is enforced in the write instead.
 */
export async function restoreCookbook(
  userId: string,
  cookbookId: string,
): Promise<Result<true, CookbookAdminError>> {
  const { count } = await cookbookRepository.restore(cookbookId, userId);
  if (count === 0) return err(NOT_YOURS);
  return ok(true);
}

export type ArchivedCookbook = {
  id: string;
  title: string;
  description: string | null;
  recipeCount: number;
};

/** The owner's archived cookbooks. Nobody else can see these. */
export async function listArchivedCookbooks(
  userId: string,
): Promise<ArchivedCookbook[]> {
  const rows = await cookbookRepository.listArchivedForOwner(userId);
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    recipeCount: row._count.recipes,
  }));
}
