import Link from "next/link";
import { requireOnboardedUser } from "@/lib/user";
import { listUserCookbooks } from "@/server/services/cookbook.service";
import CookbookList from "./cookbook-list";

// Container: owns auth + data, hands rows to the presentational list.
// requireOnboardedUser redirects signed-out visitors to sign-in and
// un-onboarded users to /onboarding.
export default async function DashboardPage() {
  const user = await requireOnboardedUser();
  const cookbooks = await listUserCookbooks(user.id);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Your library</h1>
        <Link
          href="/cookbooks/new"
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          New cookbook
        </Link>
      </div>

      <CookbookList cookbooks={cookbooks} />
    </div>
  );
}
