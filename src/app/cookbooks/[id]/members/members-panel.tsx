import InviteForm from "./invite-form";
import RoleRow from "./role-row";
import JoinLinkControls from "./join-link-controls";
import type { MembersView } from "@/server/services/member.service";
import {
  inviteMembersAction,
  changeMemberRoleAction,
  removeMemberAction,
  changeInviteRoleAction,
  cancelInviteAction,
  setJoinLinkEnabledAction,
  setJoinLinkRoleAction,
  resetJoinLinkAction,
} from "./actions";

// The people-management UI itself, with no opinion about where it's shown.
// Rendered both inside the share dialog on the cookbook page and as the whole
// of /cookbooks/[id]/members — so the two can't drift apart.
//
// Deliberately a Server Component: only the individual controls need to be
// interactive, so the list markup ships as HTML rather than JS. It reaches the
// dialog (a Client Component) as `children`.
//
// It binds its own actions to the cookbook it's showing. Binding server-side
// means the id never rides along in a form, so a crafted POST can't retarget
// an action at a different cookbook — and doing it here, once, means neither
// page that renders the panel can forget one.

export default function MembersPanel({ view }: { view: MembersView }) {
  const id = view.cookbookId;
  const actions = {
    invite: inviteMembersAction.bind(null, id),
    changeMemberRole: changeMemberRoleAction.bind(null, id),
    removeMember: removeMemberAction.bind(null, id),
    changeInviteRole: changeInviteRoleAction.bind(null, id),
    cancelInvite: cancelInviteAction.bind(null, id),
  };

  return (
    <div className="space-y-8">
      {/* Inviting comes first: it's why someone opens this. Owners only —
          everyone else sees just the roster below. */}
      {view.canManageMembers ? (
        <section>
          <InviteForm action={actions.invite} />
        </section>
      ) : null}

      {/* The link sits with the other ways in, above the roster. Owners only:
          the token is itself the permission to join. */}
      {view.joinLink ? (
        <section>
          <JoinLinkControls
            link={view.joinLink}
            setEnabledAction={setJoinLinkEnabledAction.bind(null, id)}
            setRoleAction={setJoinLinkRoleAction.bind(null, id)}
            resetAction={resetJoinLinkAction.bind(null, id)}
          />
        </section>
      ) : null}

      <section>
        <h3 className="text-subheadline font-medium">People with access</h3>
        <ul className="mt-1 divide-y divide-border-faint">
          {view.members.map((member) => (
            <RoleRow
              key={member.userId}
              name={member.name}
              // Only ever "You" — the role column already carries "Owner", and
              // showing both made the owner's own row read "Owner" twice.
              sublabel={member.isSelf ? "You" : undefined}
              avatarUrl={member.avatarUrl}
              idField="userId"
              id={member.userId}
              role={member.role}
              // The owner's row is fixed: Cookbook.ownerId is a scalar column
              // that a demoted or deleted OWNER membership would contradict.
              editable={view.canManageMembers && !member.isOwner}
              changeRoleAction={actions.changeMemberRole}
              removeAction={actions.removeMember}
              removeLabel="Remove"
            />
          ))}
        </ul>
      </section>

      {view.outstandingInvites.length > 0 ? (
        <section>
          <h3 className="text-subheadline font-medium">Waiting to accept</h3>
          <p className="mt-0.5 text-caption-1 text-foreground-tertiary">
            They don&rsquo;t have access yet.
          </p>
          <ul className="mt-1 divide-y divide-border-faint">
            {view.outstandingInvites.map((invite) => (
              <RoleRow
                key={invite.id}
                name={invite.name}
                idField="inviteId"
                id={invite.id}
                role={invite.role}
                editable
                changeRoleAction={actions.changeInviteRole}
                removeAction={actions.cancelInvite}
                removeLabel="Cancel"
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
