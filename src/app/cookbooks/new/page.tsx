import { requireOnboardedUser } from "@/lib/user";
import SetupProgress from "@/components/setup-progress";
import { createCookbookAction } from "./actions";
import CookbookForm from "./cookbook-form";

// Container: owns auth, wires the Server Action into the presentational form.
// requireOnboardedUser redirects signed-out visitors to sign-in and
// un-onboarded users to /onboarding.
//
// Step one of three. It asks for the one thing a cookbook can't exist without
// and then creates it — the cover and the invitations are separate screens
// operating on a real cookbook, not held state.
export default async function NewCookbookPage() {
  await requireOnboardedUser();

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <SetupProgress current="name" />

      <h1 className="mt-4 text-title-1">New cookbook</h1>
      <p className="mt-2 text-subheadline text-foreground-secondary">
        Give it a name. You&rsquo;ll design the cover and invite people next.
      </p>

      <div className="mt-8">
        <CookbookForm action={createCookbookAction} />
      </div>
    </div>
  );
}
