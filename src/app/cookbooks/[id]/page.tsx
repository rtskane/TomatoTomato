import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/user";
import { getCookbookDetail } from "@/server/services/cookbook.service";
import { getCookbookMembers } from "@/server/services/member.service";
import RecipeList from "./recipe-list";
import ShareDialog from "./share-dialog";
import MembersPanel from "./members/members-panel";
import {
  inviteMembersAction,
  changeMemberRoleAction,
  removeMemberAction,
  changeInviteRoleAction,
  cancelInviteAction,
} from "./members/actions";

// Container: owns auth + data, hands rows to the presentational list.
export default async function CookbookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireOnboardedUser();

  // The share dialog's contents are rendered up front rather than fetched when
  // it opens, which is what makes opening instant. Both queries are
  // membership-scoped and indexed, and running them together costs about one
  // round trip rather than two.
  const [cookbook, members] = await Promise.all([
    getCookbookDetail(user.id, id),
    getCookbookMembers(user.id, id),
  ]);

  // Non-members get a 404 rather than a 403 — whether a cookbook exists is
  // itself something they shouldn't learn.
  if (!cookbook || !members) notFound();

  // Binding the id server-side means it never rides along in the form, so a
  // crafted POST can't retarget these at a different cookbook.
  const actions = {
    invite: inviteMembersAction.bind(null, cookbook.id),
    changeMemberRole: changeMemberRoleAction.bind(null, cookbook.id),
    removeMember: removeMemberAction.bind(null, cookbook.id),
    changeInviteRole: changeInviteRoleAction.bind(null, cookbook.id),
    cancelInvite: cancelInviteAction.bind(null, cookbook.id),
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link
        href="/dashboard"
        className="text-sm text-black/60 hover:underline dark:text-white/60"
      >
        ← Your library
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{cookbook.title}</h1>
          {cookbook.description ? (
            <p className="mt-2 text-black/70 dark:text-white/70">
              {cookbook.description}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Open to every member: a viewer can't invite anyone, but seeing who
              else is in a cookbook they're part of is reasonable. The panel
              itself decides which controls they get. */}
          <ShareDialog
            cookbookTitle={cookbook.title}
            memberCount={members.members.length}
          >
            <MembersPanel view={members} actions={actions} />
          </ShareDialog>

          {cookbook.canAddRecipes ? (
            <Link
              href={`/cookbooks/${cookbook.id}/recipes/new`}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              New recipe
            </Link>
          ) : null}
        </div>
      </div>

      <RecipeList
        recipes={cookbook.recipes}
        canAddRecipes={cookbook.canAddRecipes}
        cookbookId={cookbook.id}
      />
    </div>
  );
}
