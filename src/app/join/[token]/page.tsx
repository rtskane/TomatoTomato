import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import BookCover from "@/components/book-cover";
import { ensureUser } from "@/lib/user";
import type { GrantableRole } from "@/lib/invite";
import { previewJoinLink } from "@/server/services/member.service";
import { joinWithLinkAction } from "./actions";
import JoinButton from "./join-button";

// Where a cookbook's "anyone with this link can join" link lands.
//
// Public, unlike every other cookbook page: the whole point is to reach people
// who don't have an account yet. What it shows a signed-out visitor is only
// what the owner chose to share by sending the link — the cookbook's cover,
// title and description, who runs it, and the role on offer. No recipes.
//
// The path through it for someone new: this page → sign up → back here (Clerk
// honours `redirect_url`) → onboarding, which carries `next` → back here again,
// now able to press Join.

type Params = { token: string };

const ROLE_COPY: Record<GrantableRole, { name: string; can: string }> = {
  EDITOR: { name: "an editor", can: "add recipes and read everyone else's" },
  VIEWER: { name: "a viewer", can: "read every recipe in it" },
};

export default async function JoinPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { token } = await params;
  const here = `/join/${token}`;

  const user = await ensureUser();
  const preview = await previewJoinLink(token, user?.id);

  if (!preview) return <DeadLink signedIn={Boolean(user)} />;

  // Signed in, but hasn't picked a username yet — onboarding first, then back.
  if (user && !user.username) {
    redirect(`/onboarding?next=${encodeURIComponent(here)}`);
  }

  // Nothing to join: take them to it.
  if (preview.alreadyMember) redirect(`/cookbooks/${preview.cookbookId}`);

  const role = ROLE_COPY[preview.role];
  const others = preview.memberCount - 1;

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="flex flex-col items-center text-center">
        <BookCover
          title={preview.title}
          design={preview.design}
          sizes="128px"
          className="h-44 w-32 shadow-md"
        />

        <p className="mt-8 text-subheadline text-foreground-secondary">
          {preview.ownerName} invited you to join
        </p>
        <h1 className="mt-1 font-serif text-title-1 wrap-break-word">
          {preview.title}
        </h1>
        {preview.description ? (
          <p className="mt-3 text-foreground-secondary">{preview.description}</p>
        ) : null}

        <p className="mt-6 text-subheadline text-foreground-secondary">
          You&rsquo;ll join as {role.name}, so you can {role.can}.
          {others > 0
            ? ` ${others} ${others === 1 ? "other person is" : "other people are"} already in it.`
            : ""}
        </p>
      </div>

      <div className="mt-8">
        {user ? (
          <JoinButton
            action={joinWithLinkAction.bind(null, token)}
            label={`Join ${preview.title}`}
          />
        ) : (
          <div className="space-y-3">
            {/* Clerk sends them back here once they're in. */}
            <Link
              href={`/sign-up?redirect_url=${encodeURIComponent(here)}`}
              className="block w-full rounded-lg bg-accent px-5 py-2.5 text-center font-medium text-on-accent hover:bg-accent-hover"
            >
              Sign up to join
            </Link>
            <p className="text-center text-subheadline text-foreground-secondary">
              Already have an account?{" "}
              <Link
                href={`/sign-in?redirect_url=${encodeURIComponent(here)}`}
                className="font-medium text-foreground underline hover:no-underline"
              >
                Sign in
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function DeadLink({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-title-2">This link doesn&rsquo;t work any more</h1>
      <p className="mt-3 text-foreground-secondary">
        Whoever sent it may have turned it off or made a new one. Ask them for
        the latest link.
      </p>
      <Link
        href={signedIn ? "/dashboard" : "/"}
        className="mt-8 inline-block text-subheadline font-medium underline hover:no-underline"
      >
        {signedIn ? "Go to your library" : "Go to the home page"}
      </Link>
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  // The same arguments as the page, so the cached lookup is shared.
  const user = await ensureUser();
  const preview = await previewJoinLink((await params).token, user?.id);
  return {
    title: preview ? `Join ${preview.title}` : "Invite link",
    // A link that lets people in is not something to show up in search.
    robots: { index: false, follow: false },
  };
}
