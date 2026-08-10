import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/user";
import { getCookbookMembers } from "@/server/services/member.service";
import MembersPanel from "./members-panel";
import {
  inviteMembersAction,
  changeMemberRoleAction,
  removeMemberAction,
  changeInviteRoleAction,
  cancelInviteAction,
} from "./actions";

/**
 * The share panel as a page of its own.
 *
 * Sharing normally happens in the dialog on the cookbook page; this route backs
 * it up — a deep link still lands somewhere real, and it's the whole feature
 * for anyone without JavaScript, since the dialog needs `showModal()` but every
 * control inside it is a plain form.
 */
export default async function MembersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireOnboardedUser();
  const view = await getCookbookMembers(user.id, id);

  // Non-members get a 404 rather than a 403 — whether a cookbook exists is
  // itself something they shouldn't learn.
  if (!view) notFound();

  const actions = {
    invite: inviteMembersAction.bind(null, view.cookbookId),
    changeMemberRole: changeMemberRoleAction.bind(null, view.cookbookId),
    removeMember: removeMemberAction.bind(null, view.cookbookId),
    changeInviteRole: changeInviteRoleAction.bind(null, view.cookbookId),
    cancelInvite: cancelInviteAction.bind(null, view.cookbookId),
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link
        href={`/cookbooks/${view.cookbookId}`}
        className="text-sm text-black/60 hover:underline dark:text-white/60"
      >
        ← {view.cookbookTitle}
      </Link>

      <h1 className="mt-4 mb-8 text-2xl font-semibold">
        Share &ldquo;{view.cookbookTitle}&rdquo;
      </h1>

      <MembersPanel view={view} actions={actions} />
    </div>
  );
}
