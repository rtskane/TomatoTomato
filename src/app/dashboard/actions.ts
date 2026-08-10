"use server";

import { revalidatePath } from "next/cache";
import { requireOnboardedUser } from "@/lib/user";
import { acceptInvite, declineInvite } from "@/server/services/member.service";

// Thin adapter: the only layer that knows about HTTP/FormData and auth.
//
// The invite id is the one thing the client legitimately supplies — the service
// re-reads the invite and refuses any that isn't addressed to the session user,
// so a forged id gets a not-found rather than someone else's cookbook.

export type InviteResponseState = { error?: string };

export async function acceptInviteAction(
  _prevState: InviteResponseState,
  formData: FormData,
): Promise<InviteResponseState> {
  const user = await requireOnboardedUser();

  const result = await acceptInvite(
    user.id,
    String(formData.get("inviteId") ?? ""),
  );
  if (!result.ok) return { error: result.error.message };

  // The library gains a cookbook and the invite list loses a row — both live on
  // this page, so one revalidation covers it.
  revalidatePath("/dashboard");
  return {};
}

export async function declineInviteAction(
  _prevState: InviteResponseState,
  formData: FormData,
): Promise<InviteResponseState> {
  const user = await requireOnboardedUser();

  const result = await declineInvite(
    user.id,
    String(formData.get("inviteId") ?? ""),
  );
  if (!result.ok) return { error: result.error.message };

  revalidatePath("/dashboard");
  return {};
}
