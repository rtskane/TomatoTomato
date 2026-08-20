import { requireOnboardedUser } from "@/lib/user";
import { suggestCoverColor } from "@/lib/book-covers";
import { createCookbookAction } from "./actions";
import CookbookForm from "./cookbook-form";

// Container: owns auth, wires the Server Action into the presentational form.
// requireOnboardedUser redirects signed-out visitors to sign-in and
// un-onboarded users to /onboarding.
export default async function NewCookbookPage() {
  await requireOnboardedUser();

  return (
    // Wider than the other single-column forms: the cover designer puts a book
    // preview beside two rows of controls, and at max-w-md the swatches wrap
    // into a cramped block.
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-title-1">New cookbook</h1>
      <p className="mt-2 text-subheadline text-foreground-secondary">
        Start a collection. You can invite collaborators once it exists.
      </p>

      <div className="mt-8">
        {/* Picked here rather than in the form: a colour drawn during a client
            render would differ between the server pass and hydration. */}
        <CookbookForm
          action={createCookbookAction}
          suggestedCoverColor={suggestCoverColor()}
        />
      </div>
    </div>
  );
}
