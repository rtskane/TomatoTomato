import Link from "next/link";
import { cookies } from "next/headers";
import { requireOnboardedUser } from "@/lib/user";
import {
  listUserCookbooks,
  listArchivedCookbooks,
} from "@/server/services/cookbook.service";
import CookbookLibrary from "./cookbook-library";
import ArchivedCookbooks from "./archived-cookbooks";
import { restoreCookbookAction } from "../cookbooks/[id]/settings-actions";
import { LIBRARY_VIEW_COOKIE, parseLibraryView } from "./library-view";

// Container: owns auth + data, hands rows to the presentational list.
// requireOnboardedUser redirects signed-out visitors to sign-in and
// un-onboarded users to /onboarding.
export default async function DashboardPage() {
  const user = await requireOnboardedUser();
  const [cookbooks, archived, cookieStore] = await Promise.all([
    listUserCookbooks(user.id),
    listArchivedCookbooks(user.id),
    // Reading a cookie makes the route dynamic, which this one already is:
    // it is behind auth and reads the database on every request.
    cookies(),
  ]);

  // Which layout the reader last chose, so the first paint is already right
  // rather than flipping after hydration.
  const view = parseLibraryView(cookieStore.get(LIBRARY_VIEW_COOKIE)?.value);

  // Bind each restore server-side, so no cookbook id is submitted by the client.
  const archivedItems = archived.map((cookbook) => ({
    ...cookbook,
    restore: restoreCookbookAction.bind(null, cookbook.id),
  }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-title-1">Your library</h1>
        <Link
          href="/cookbooks/new"
          className="rounded-md bg-accent px-4 py-2 text-subheadline font-medium text-on-accent hover:bg-accent-hover"
        >
          New cookbook
        </Link>
      </div>

      <CookbookLibrary cookbooks={cookbooks} initialView={view} />

      {/* Renders nothing until something has actually been archived. */}
      <ArchivedCookbooks cookbooks={archivedItems} />
    </div>
  );
}
