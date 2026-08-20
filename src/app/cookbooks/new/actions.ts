"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOnboardedUser } from "@/lib/user";
import { createCookbook } from "@/server/services/cookbook.service";
import { setupPath } from "@/lib/setup-steps";

// Thin adapter: the only layer that knows about HTTP/FormData, auth, and
// redirects. It translates the request into a service call and the service's
// Result into useActionState state.

export type CreateCookbookState = {
  error?: string;
  values?: { title: string; description: string };
};

/**
 * Step one of setting up a cookbook: name it.
 *
 * This creates the cookbook outright rather than holding it until the cover
 * and the invitations are settled. The whole reason for that: naming is the
 * only required part, and a wizard that discards a title because someone
 * closed the tab at the cover step would be losing work it had no need to
 * hold. Every later step edits a cookbook that already exists, which is also
 * what makes them skippable and resumable — there is nothing in flight to
 * lose.
 *
 * It follows that this action takes no cover fields at all. The cover is
 * designed on the next screen, against a real cookbook id.
 */
export async function createCookbookAction(
  _prevState: CreateCookbookState,
  formData: FormData,
): Promise<CreateCookbookState> {
  // Server Actions are reachable via direct POST — re-check auth here.
  // requireOnboardedUser also gives us the internal User row, whose `id` is
  // what the ownership foreign key needs.
  const user = await requireOnboardedUser();

  const values = {
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
  };

  const result = await createCookbook(user.id, values);
  if (!result.ok) {
    return { error: result.error.message, values };
  }

  // The dashboard is dynamic, but its client-side router cache may still hold
  // a render from before this cookbook existed.
  revalidatePath("/dashboard");
  redirect(setupPath(result.value.id, "cover"));
}
