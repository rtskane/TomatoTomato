"use server";

import { revalidatePath } from "next/cache";
import { requireOnboardedUser } from "@/lib/user";
import {
  changeMemberRole,
  removeMember,
  setJoinLinkEnabled,
  setJoinLinkRole,
  resetJoinLink,
  createOneTimeLink,
  revokeOneTimeLink,
  type JoinLinkView,
  type OneTimeLinkView,
} from "@/server/services/member.service";

// Thin adapter: the only layer that knows about HTTP/FormData and auth. It
// translates the request into a service call and the service's Result into
// useActionState state.
//
// Every action re-checks auth and re-derives the actor from the session, never
// from the form — Server Actions are reachable by direct POST, so the only
// thing the client is trusted to say is *which* cookbook, member or link to act
// on.

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
 * `cookbookId` is bound server-side by the page rather than submitted as a
 * hidden field, so a crafted POST can't retarget an action at another
 * cookbook. (The service checks permission regardless; this removes the
 * question.)
 */
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

// ---------------------------------------------------------------------------
// The "anyone with this link can join" link
// ---------------------------------------------------------------------------

/** What the link controls show: the saved link, or why a change didn't land. */
export type JoinLinkState = { error?: string; link?: JoinLinkView };

export async function setJoinLinkEnabledAction(
  cookbookId: string,
  _prevState: JoinLinkState,
  formData: FormData,
): Promise<JoinLinkState> {
  const user = await requireOnboardedUser();

  const result = await setJoinLinkEnabled(
    user.id,
    cookbookId,
    formData.get("enabled") === "true",
  );
  if (!result.ok) return { error: result.error.message };

  revalidateMembers(cookbookId);
  return { link: result.value };
}

export async function setJoinLinkRoleAction(
  cookbookId: string,
  _prevState: JoinLinkState,
  formData: FormData,
): Promise<JoinLinkState> {
  const user = await requireOnboardedUser();

  const result = await setJoinLinkRole(
    user.id,
    cookbookId,
    String(formData.get("role") ?? ""),
  );
  if (!result.ok) return { error: result.error.message };

  revalidateMembers(cookbookId);
  return { link: result.value };
}

export async function resetJoinLinkAction(
  cookbookId: string,
  _prevState: JoinLinkState,
  _formData: FormData,
): Promise<JoinLinkState> {
  const user = await requireOnboardedUser();

  const result = await resetJoinLink(user.id, cookbookId);
  if (!result.ok) return { error: result.error.message };

  revalidateMembers(cookbookId);
  return { link: result.value };
}

// ---------------------------------------------------------------------------
// One-time links
// ---------------------------------------------------------------------------

/** What the create form shows: the link just made, or why it wasn't. */
export type OneTimeLinkState = { error?: string; created?: OneTimeLinkView };

export async function createOneTimeLinkAction(
  cookbookId: string,
  _prevState: OneTimeLinkState,
  formData: FormData,
): Promise<OneTimeLinkState> {
  const user = await requireOnboardedUser();

  const result = await createOneTimeLink(
    user.id,
    cookbookId,
    String(formData.get("role") ?? ""),
    String(formData.get("label") ?? ""),
  );
  if (!result.ok) return { error: result.error.message };

  revalidateMembers(cookbookId);
  return { created: result.value };
}

export async function revokeOneTimeLinkAction(
  cookbookId: string,
  _prevState: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const user = await requireOnboardedUser();

  const result = await revokeOneTimeLink(
    user.id,
    String(formData.get("linkId") ?? ""),
  );
  if (!result.ok) return { error: result.error.message };

  revalidateMembers(cookbookId);
  return {};
}
