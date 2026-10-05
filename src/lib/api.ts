import { ensureUser } from "@/lib/user";
import type { ApiErrorBody, ApiErrorCode, Me } from "@/lib/api-types";

// Shared plumbing for the JSON API under /api/v1, which the phone app calls.
//
// The app signs in with Clerk and sends its session token as
// `Authorization: Bearer <token>`. clerkMiddleware (src/proxy.ts) reads that
// header as readily as the web's session cookie, so `ensureUser()` works here
// unchanged — what differs is how a refusal is said. A page redirects to
// /sign-in; an API answers with a status and a code the app can branch on.

export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
): Response {
  return Response.json({ error: message, code } satisfies ApiErrorBody, {
    status,
  });
}

export const notFound = () => apiError(404, "not_found", "Not found.");

export const unauthenticated = () =>
  apiError(401, "unauthenticated", "Not signed in.");

/**
 * The request body as a JSON object. An empty body counts as `{}`, so every
 * field can be optional. Null when there's a body that isn't a JSON object —
 * the caller answers that with a 400, not a 500 from a parse error.
 */
export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.trim() === "") return {};
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export const invalidBody = () =>
  apiError(400, "invalid_request", "Expected a JSON object.");

type User = NonNullable<Awaited<ReturnType<typeof ensureUser>>>;

/** How the app sees the signed-in user — `GET /me`, and after onboarding. */
export function toMe(user: User): Me {
  return {
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    avatarUrl: user.avatarUrl,
    onboarded: user.username !== null,
  };
}

export type ApiUser = User & { username: string };

/**
 * The API's version of `requireOnboardedUser`: the signed-in, onboarded user,
 * or the response to send instead.
 *
 * Not finishing onboarding is a 403 with its own code rather than a 401, so the
 * app can tell "sign in again" from "you still need to pick a username".
 */
export async function requireApiUser(): Promise<
  { user: ApiUser; response?: never } | { user?: never; response: Response }
> {
  const user = await ensureUser();
  if (!user) {
    return { response: unauthenticated() };
  }
  if (!user.username) {
    return {
      response: apiError(
        403,
        "onboarding_required",
        "Finish setting up your account first.",
      ),
    };
  }
  return { user: { ...user, username: user.username } };
}
