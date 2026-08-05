import { onboardingSchema } from "@/lib/username";
import {
  userRepository,
  UsernameTakenError,
} from "@/server/repositories/user.repository";
import { ok, err, type Result } from "@/server/result";

// Business logic for onboarding. Deliberately framework-free — no next/*, no
// @clerk/* — so it can be unit-tested by calling onboardUser(clerkId, input)
// directly. The caller (the Server Action) owns auth and redirects.

export type OnboardingInput = {
  username: string;
  firstName: string;
  lastName: string;
};

export type OnboardingError =
  | { kind: "validation"; message: string }
  | { kind: "username_taken"; message: string };

export async function onboardUser(
  clerkId: string,
  input: OnboardingInput,
): Promise<Result<{ username: string }, OnboardingError>> {
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) {
    const message =
      parsed.error.issues[0]?.message ?? "Please check your input.";
    return err({ kind: "validation", message });
  }

  try {
    await userRepository.setProfile({
      clerkId,
      username: parsed.data.username,
      firstName: parsed.data.firstName ?? null,
      lastName: parsed.data.lastName ?? null,
    });
  } catch (e) {
    if (e instanceof UsernameTakenError) {
      return err({
        kind: "username_taken",
        message: "That username is already taken.",
      });
    }
    throw e; // unexpected — let it surface as a 500
  }

  return ok({ username: parsed.data.username });
}
