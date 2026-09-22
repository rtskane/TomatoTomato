import { redirect } from "next/navigation";
import { ensureUser } from "@/lib/user";
import { completeOnboarding } from "./actions";
import OnboardingForm from "./onboarding-form";
import { safeReturnPath } from "@/lib/return-path";

// Container: owns auth + data, decides whether onboarding is needed, and wires
// the Server Action into the presentational form. No markup logic lives here.
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  // Where to go once this is done — set by a join link that sent a new user
  // through sign-up, so they land back on the cookbook they were joining.
  const next = safeReturnPath((await searchParams).next);

  const user = await ensureUser();
  if (!user) redirect("/sign-in");
  // Already onboarded — nothing to do here.
  if (user.username) redirect(next ?? "/dashboard");

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-title-1">Finish setting up your account</h1>
      <p className="mt-2 text-subheadline text-foreground-secondary">
        Pick a username so collaborators can find you. You can add your name too.
      </p>

      <div className="mt-8">
        <OnboardingForm
          action={completeOnboarding.bind(null, next)}
          defaultFirstName={user.firstName ?? undefined}
          defaultLastName={user.lastName ?? undefined}
        />
      </div>
    </div>
  );
}
