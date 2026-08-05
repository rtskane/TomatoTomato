import { redirect } from "next/navigation";
import { ensureUser } from "@/lib/user";
import { completeOnboarding } from "./actions";
import OnboardingForm from "./onboarding-form";

// Container: owns auth + data, decides whether onboarding is needed, and wires
// the Server Action into the presentational form. No markup logic lives here.
export default async function OnboardingPage() {
  const user = await ensureUser();
  if (!user) redirect("/sign-in");
  // Already onboarded — nothing to do here.
  if (user.username) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-semibold">Finish setting up your account</h1>
      <p className="mt-2 text-sm text-black/70 dark:text-white/70">
        Pick a username so collaborators can find you. You can add your name too.
      </p>

      <div className="mt-8">
        <OnboardingForm
          action={completeOnboarding}
          defaultFirstName={user.firstName ?? undefined}
          defaultLastName={user.lastName ?? undefined}
        />
      </div>
    </div>
  );
}
