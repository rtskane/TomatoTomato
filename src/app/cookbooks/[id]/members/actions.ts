"use server";

import { revalidatePath } from "next/cache";
import { requireOnboardedUser } from "@/lib/user";
import {
  inviteMembers,
  changeMemberRole,
  removeMember,
  changeInviteRole,
  cancelInvite,
  type InviteOutcome,
  type InviteRowInput,
} from "@/server/services/member.service";

// Thin adapter: the only layer that knows about HTTP/FormData and auth. It
// translates the request into a service call and the service's Result into
// useActionState state.
//
// Every action re-checks auth and re-derives the actor from the session, never
// from the form — Server Actions are reachable by direct POST, so the only
// thing the client is trusted to say is *which* cookbook or invite to act on.

export type InviteState = {
  error?: string;
  outcomes?: InviteOutcome[];
};

const all = (formData: FormData, key: string) =>
  formData.getAll(key).map((v) => String(v));

/**
 * Refresh both places this UI is rendered.
 *
 * The cookbook page is easy to forget and the more important of the two: the
 * share dialog lives there, so revalidating only `/members` left the dialog
 * rendering pre-mutation data on the page the user was actually looking at.
 */
function revalidateMembers(cookbookId: string) {
  revalidatePath(`/cookbooks/${cookbookId}`);
  revalidatePath(`/cookbooks/${cookbookId}/members`);
}

/**
 * Rebuild the invite rows from repeated form fields.
 *
 * Each row renders a username input and a role select, so the browser submits
 * two parallel lists in DOM order — zipping them by index reconstructs the
 * rows. Same shape as parseIngredients in the recipe form.
 */
function parseRows(formData: FormData): InviteRowInput[] {
  const usernames = all(formData, "inviteUsername");
  const roles = all(formData, "inviteRole");

  return usernames.map((username, i) => ({
    username,
    role: roles[i] ?? "VIEWER",
  }));
}

/**
 * `cookbookId` is bound server-side by the page rather than submitted as a
 * hidden field, so a crafted POST can't retarget the invites at another
 * cookbook. (The service checks permission regardless; this removes the
 * question.)
 */
export async function inviteMembersAction(
  cookbookId: string,
  _prevState: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const user = await requireOnboardedUser();

  const result = await inviteMembers(user.id, cookbookId, parseRows(formData));
  if (!result.ok) return { error: result.error.message };

  revalidateMembers(cookbookId);
  return { outcomes: result.value };
}

export type MemberActionState = { error?: string };

export async function changeMemberRoleAction(
  cookbookId: string,
  _prevState: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const user = await requireOnboardedUser();

  const result = await changeMemberRole(
    user.id,
    cookbookId,
    String(formData.get("userId") ?? ""),
    String(formData.get("role") ?? ""),
  );
  if (!result.ok) return { error: result.error.message };

  revalidateMembers(cookbookId);
  return {};
}

export async function removeMemberAction(
  cookbookId: string,
  _prevState: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const user = await requireOnboardedUser();

  const result = await removeMember(
    user.id,
    cookbookId,
    String(formData.get("userId") ?? ""),
  );
  if (!result.ok) return { error: result.error.message };

  revalidateMembers(cookbookId);
  return {};
}

export async function changeInviteRoleAction(
  cookbookId: string,
  _prevState: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const user = await requireOnboardedUser();

  const result = await changeInviteRole(
    user.id,
    String(formData.get("inviteId") ?? ""),
    String(formData.get("role") ?? ""),
  );
  if (!result.ok) return { error: result.error.message };

  revalidateMembers(cookbookId);
  return {};
}

export async function cancelInviteAction(
  cookbookId: string,
  _prevState: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const user = await requireOnboardedUser();

  const result = await cancelInvite(
    user.id,
    String(formData.get("inviteId") ?? ""),
  );
  if (!result.ok) return { error: result.error.message };

  revalidateMembers(cookbookId);
  return {};
}
