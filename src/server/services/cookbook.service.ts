import { createCookbookSchema } from "@/lib/cookbook";
import { cookbookRepository } from "@/server/repositories/cookbook.repository";
import { ok, err, type Result } from "@/server/result";
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
