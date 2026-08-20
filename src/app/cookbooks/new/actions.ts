"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOnboardedUser } from "@/lib/user";
import { createCookbook } from "@/server/services/cookbook.service";

// Thin adapter: the only layer that knows about HTTP/FormData, auth, and
// redirects. It translates the request into a service call and the service's
// Result into useActionState state.

export type CreateCookbookState = {
  error?: string;
  values?: { title: string; description: string; coverImageUrl: string };
};

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
    // A blob URL the browser uploaded to before submitting, or "" for no
    // cover. Checked against the blob host by the service — the client could
    // put anything in this field.
    coverImageUrl: String(formData.get("coverImageUrl") ?? ""),
  };

  const result = await createCookbook(user.id, values);
  if (!result.ok) {
    return { error: result.error.message, values };
  }

  // The dashboard is dynamic, but its client-side router cache may still hold a
  // render from before this cookbook existed.
  revalidatePath("/dashboard");
  redirect("/dashboard");
}
