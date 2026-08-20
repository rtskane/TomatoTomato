import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/user";
import { getCookbookDetail } from "@/server/services/cookbook.service";
import { getCookbookMembers } from "@/server/services/member.service";
import BookCover from "@/components/book-cover";
import SetupProgress from "@/components/setup-progress";
import MembersPanel from "../../members/members-panel";
import {
  inviteMembersAction,
  changeMemberRoleAction,
  removeMemberAction,
  changeInviteRoleAction,
  cancelInviteAction,
} from "../../members/actions";

// Container: owns auth + data. Step three of three.
//
// The panel here is the same `MembersPanel` the cookbook page and
// /cookbooks/[id]/members render — inviting people is one piece of UI with one
// set of rules, and a setup-only copy of it would be a second place for those
// rules to drift.
export default async function SetupInvitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireOnboardedUser();

  const cookbook = await getCookbookDetail(user.id, id);
  if (!cookbook || !cookbook.canEditCookbook) notFound();

  const members = await getCookbookMembers(user.id, id);
  if (!members) notFound();

  const actions = {
    invite: inviteMembersAction.bind(null, id),
    changeMemberRole: changeMemberRoleAction.bind(null, id),
    removeMember: removeMemberAction.bind(null, id),
    changeInviteRole: changeInviteRoleAction.bind(null, id),
    cancelInvite: cancelInviteAction.bind(null, id),
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <SetupProgress current="invite" />

      <div className="mt-4 flex items-start gap-4">
        {/* The finished book, so the last step of setup shows what was made
            rather than only asking for one more thing. */}
        <div aria-hidden className="shrink-0">
          <BookCover
            title={cookbook.title}
            design={cookbook.design}
            sizes="80px"
            className="aspect-3/4 w-20 shadow-md"
          />
        </div>

        <div className="min-w-0">
          <h1 className="text-title-1">{cookbook.title} is ready</h1>
          <p className="mt-2 text-subheadline text-foreground-secondary">
            Cook with other people by inviting them now — or add recipes first
            and invite whenever you like.
          </p>
        </div>
      </div>

      <div className="mt-8">
        <MembersPanel view={members} actions={actions} />
      </div>

      <div className="mt-10 flex items-center gap-3 border-t border-border pt-6">
        <Link
          href={`/cookbooks/${cookbook.id}`}
          className="rounded-md bg-accent px-4 py-2 font-medium text-on-accent hover:bg-accent-hover"
        >
          Go to the cookbook
        </Link>
        <Link
          href="/dashboard"
          className="text-subheadline text-foreground-secondary hover:underline"
        >
          Back to the library
        </Link>
      </div>
    </div>
  );
}
