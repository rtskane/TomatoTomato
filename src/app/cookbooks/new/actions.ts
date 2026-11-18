"use server";

import { revalidatePath } from "next/cache";
import { requireOnboardedUser } from "@/lib/user";
import { createCookbook } from "@/server/services/cookbook.service";
import { COVER_FIELD_NAMES, type CoverFieldName } from "@/lib/cover-fields";

// Thin adapter: the only layer that knows about auth and the cache. It
// translates the request into a service call and the service's Result into
// something the page can act on.

export type CreateCookbookInput = {
  title: string;
  /** The cover, as the string fields a form would post — see `coverFields`. */
  cover: Partial<Record<CoverFieldName, string>>;
};

export type CreateCookbookResult = { id: string } | { error: string };

/**
 * Create a cookbook from its name and its cover, together.
 *
 * The two are chosen on one screen — the name is printed on the cover, so
 * each is designed against the other — and nothing is written until this
 * runs. What is in flight before then lives in the browser (see
 * lib/cookbook-draft.ts), which is why this **returns** the new id rather
 * than redirecting: the page has a draft to throw away before it moves on,
 * and it can only do that once it knows the cookbook exists.
 *
 * Called with a plain object rather than a FormData: the cover is state held
 * by the picker and the editor, not a set of inputs, and it is the same call
 * from either. The argument still arrives from the browser, so nothing in it
 * is trusted — every field is forced to a string here and validated by the
 * service.
 */
export async function createCookbookAction(
  input: CreateCookbookInput,
): Promise<CreateCookbookResult> {
  // Server Actions are reachable via direct POST — re-check auth here.
  // requireOnboardedUser also gives us the internal User row, whose `id` is
  // what the ownership foreign key needs.
  const user = await requireOnboardedUser();

  const cover: Partial<Record<CoverFieldName, string>> = {};
  for (const name of COVER_FIELD_NAMES) {
    const value = input?.cover?.[name];
    if (typeof value === "string") cover[name] = value;
  }

  const result = await createCookbook(user.id, {
    title: typeof input?.title === "string" ? input.title : "",
    description: "",
    ...cover,
  });
  if (!result.ok) return { error: result.error.message };

  // The dashboard is dynamic, but its client-side router cache may still hold
  // a render from before this cookbook existed.
  revalidatePath("/dashboard");
  return { id: result.value.id };
}
