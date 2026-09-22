"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOnboardedUser } from "@/lib/user";
import { joinWithLink } from "@/server/services/member.service";

// Thin adapter for joining through a cookbook's link. The token is bound by
// the page; the service looks it up again rather than trusting that the link
// still works, since it may have been reset since the page was shown.

export type JoinState = { error?: string };

export async function joinWithLinkAction(
  token: string,
  _prevState: JoinState,
  _formData: FormData,
): Promise<JoinState> {
  // Server Actions are reachable by direct POST — re-check auth here.
  const user = await requireOnboardedUser();

  const result = await joinWithLink(user.id, token);
  if (!result.ok) return { error: result.error.message };

  // Their library gains a book.
  revalidatePath("/dashboard");
  redirect(`/cookbooks/${result.value.cookbookId}`);
}
