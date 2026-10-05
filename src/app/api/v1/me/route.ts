import { ensureUser } from "@/lib/user";
import { deleteOwnAccount } from "@/lib/account";
import {
  apiError,
  invalidBody,
  readJsonObject,
  toMe,
  unauthenticated,
} from "@/lib/api";
import type { Me } from "@/lib/api-types";

/**
 * Who the app is signed in as — the first thing it asks after sign-in.
 *
 * Unlike the other endpoints this answers for someone who hasn't finished
 * onboarding, with `onboarded: false`, because that's how the app learns to
 * show onboarding rather than the library.
 */
export async function GET(): Promise<Response> {
  const user = await ensureUser();
  if (!user) return unauthenticated();

  return Response.json(toMe(user) satisfies Me);
}

/**
 * Delete the signed-in person's account — App Store review requires this be
 * possible inside the app. Body: `DeleteAccountRequest`. The same steps as the
 * web's dialog, via `deleteOwnAccount`.
 *
 * Works before onboarding too: someone who signs up and changes their mind
 * shouldn't have to pick a username first.
 */
export async function DELETE(request: Request): Promise<Response> {
  const user = await ensureUser();
  if (!user) return unauthenticated();

  // No body means "keep", as when the web dialog asks nothing.
  const body = await readJsonObject(request);
  if (!body) return invalidBody();
  const { recipes } = body;
  if (recipes !== undefined && recipes !== "keep" && recipes !== "delete") {
    return apiError(
      400,
      "invalid_request",
      'recipes must be "keep" or "delete".',
    );
  }

  const result = await deleteOwnAccount(user, {
    keepRecipes: recipes !== "delete",
  });
  if (result.ok) return new Response(null, { status: 204 });

  return result.failed === "data"
    ? apiError(
        500,
        "delete_failed",
        "Something went wrong, and nothing was deleted. Please try again.",
      )
    : apiError(
        502,
        "sign_in_not_closed",
        "Your cookbooks and recipes are deleted, but we couldn't close your sign-in. Please try again.",
      );
}

