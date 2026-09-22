import RoleRow from "./role-row";
import JoinLinkControls from "./join-link-controls";
import OneTimeLinks from "./one-time-links";
import type { MembersView } from "@/server/services/member.service";
import {
  changeMemberRoleAction,
  removeMemberAction,
  setJoinLinkEnabledAction,
  setJoinLinkRoleAction,
  resetJoinLinkAction,
  createOneTimeLinkAction,
  revokeOneTimeLinkAction,
} from "./actions";

// The sharing UI itself, with no opinion about where it's shown. Rendered
// inside the share dialog on the cookbook page, as the whole of
// /cookbooks/[id]/members, and as the last step of setting a cookbook up — so
// the three can't drift apart.
//
// Laid out the way Google Docs lays out sharing: the ways in first (the
// cookbook's link, then links for one person each), then who has access.
//
// Deliberately a Server Component: only the individual controls need to be
// interactive, so the list markup ships as HTML rather than JS. It reaches the
// dialog (a Client Component) as `children`.
//
// It binds its own actions to the cookbook it's showing. Binding server-side
// means the id never rides along in a form, so a crafted POST can't retarget
// an action at a different cookbook — and doing it here, once, means no page
// that renders the panel can forget one.

export default function MembersPanel({ view }: { view: MembersView }) {
  const id = view.cookbookId;

  return (
    <div className="space-y-8">
      {/* Owners only: a link's token is itself the permission to join. */}
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

      {view.canManageMembers ? (
        <section>
          <OneTimeLinks
            links={view.oneTimeLinks}
            createAction={createOneTimeLinkAction.bind(null, id)}
            revokeAction={revokeOneTimeLinkAction.bind(null, id)}
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
              id={member.userId}
              role={member.role}
              // The owner's row is fixed: Cookbook.ownerId is a scalar column
              // that a demoted or deleted OWNER membership would contradict.
              editable={view.canManageMembers && !member.isOwner}
              changeRoleAction={changeMemberRoleAction.bind(null, id)}
              removeAction={removeMemberAction.bind(null, id)}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}
