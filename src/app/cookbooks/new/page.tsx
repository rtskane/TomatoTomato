import { requireOnboardedUser } from "@/lib/user";
import SetupProgress from "@/components/setup-progress";
import NewCookbook from "./new-cookbook";

// Container: owns auth. requireOnboardedUser redirects signed-out visitors to
// sign-in and un-onboarded users to /onboarding.
//
// Step one of two: name the cookbook and choose its cover, together, because
// the name is printed on the cover and each is easier to settle while looking
// at the other. Nothing is created until both are — see `createCookbookAction`.
export default async function NewCookbookPage() {
  await requireOnboardedUser();

  return (
    // No bottom padding on a phone: the page ends in the create bar, which
    // sticks to the bottom of the screen and carries its own.
    <div className="mx-auto max-w-4xl px-4 pt-10 sm:pb-10">
      <SetupProgress current="cover" />
      <h1 className="mt-4 text-title-1">New cookbook</h1>
      <p className="mt-2 text-subheadline text-foreground-secondary">
        Name it and give it a cover. You can change both whenever you like.
      </p>

      <NewCookbook />
    </div>
  );
}
