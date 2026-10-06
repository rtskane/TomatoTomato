import { ensureUser } from "@/lib/user";
import {
  apiError,
  invalidBody,
  readJsonObject,
  toMe,
  unauthenticated,
} from "@/lib/api";
import type { Me } from "@/lib/api-types";
import { onboardUser } from "@/server/services/onboarding.service";
import { userRepository } from "@/server/repositories/user.repository";

/**
 * Pick a username (and optionally a name) — the app's version of the web's
 * onboarding form. Body: `OnboardingRequest`. Answers with the updated `Me`.
 *
 * Signed in is enough here, unlike the rest of the API: this is how someone
 * becomes onboarded.
 */
export async function POST(request: Request): Promise<Response> {
  // Also creates the local row, if this is the first request they've made.
  const user = await ensureUser();
  if (!user) return unauthenticated();

  const body = await readJsonObject(request);
  if (!body) return invalidBody();

  const result = await onboardUser(user.clerkId, {
    username: text(body.username),
    firstName: text(body.firstName),
    lastName: text(body.lastName),
  });
  if (!result.ok) {
    return result.error.kind === "username_taken"
      ? apiError(409, "username_taken", result.error.message)
      : apiError(400, "invalid_request", result.error.message);
  }

  // Read back rather than patched together, so the names come out exactly as
  // the schema stored them (trimmed, blanks as null).
  const updated = await userRepository.findByClerkId(user.clerkId);
  if (!updated) return unauthenticated();
  return Response.json(toMe(updated) satisfies Me);
}

/** A missing or non-string field is blank, as an empty form field would be. */
const text = (value: unknown) => (typeof value === "string" ? value : "");
