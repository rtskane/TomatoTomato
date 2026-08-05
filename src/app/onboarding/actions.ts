"use server";

import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ensureUser } from "@/lib/user";
import { onboardUser } from "@/server/services/onboarding.service";

// Thin adapter: the only layer that knows about HTTP/FormData, auth, and
// redirects. It translates the request into a service call and the service's
// Result into useActionState state.

export type OnboardingState = {
  error?: string;
  values?: { username: string; firstName: string; lastName: string };
};

export async function completeOnboarding(
  _prevState: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  // Server Actions are reachable via direct POST — re-check auth here.
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const values = {
    username: String(formData.get("username") ?? ""),
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
  };

  // Guarantee the local row exists (user may hit this before any other authed
  // request created it), then hand off to the service.
  await ensureUser();

  const result = await onboardUser(userId, values);
  if (!result.ok) {
    return { error: result.error.message, values };
  }

  redirect("/dashboard");
}
