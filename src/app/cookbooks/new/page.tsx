import { requireOnboardedUser } from "@/lib/user";
import { createCookbookAction } from "./actions";
import CookbookForm from "./cookbook-form";

// Container: owns auth, wires the Server Action into the presentational form.
// requireOnboardedUser redirects signed-out visitors to sign-in and
// un-onboarded users to /onboarding.
export default async function NewCookbookPage() {
  await requireOnboardedUser();

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-title-1">New cookbook</h1>
      <p className="mt-2 text-subheadline text-foreground-secondary">
        Start a collection. You can invite collaborators once it exists.
      </p>

      <div className="mt-8">
        <CookbookForm action={createCookbookAction} />
      </div>
    </div>
  );
}
