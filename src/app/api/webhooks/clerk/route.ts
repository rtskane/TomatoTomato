import type { NextRequest } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { removeAccountData } from "@/lib/account";
import { userRepository } from "@/server/repositories/user.repository";

/**
 * Clerk calls this when something happens to a user. The one event that
 * matters is `user.deleted`: an account deleted anywhere other than our own
 * dialog — Clerk's profile screen, or the Clerk dashboard — so nothing of
 * theirs is left behind here either.
 *
 * Nobody asked them about their recipes, so they're kept, unattributed: the
 * choice that loses nobody else's cookbook anything and still holds nothing
 * that names them. An account our dialog already deleted arrives here too
 * (deleting the Clerk user is its last step) and finds nothing to do.
 *
 * Authentication is the Svix signature, checked against
 * CLERK_WEBHOOK_SIGNING_SECRET — anything unsigned is refused before it's read.
 */
export async function POST(request: NextRequest): Promise<Response> {
  let event;
  try {
    event = await verifyWebhook(request);
  } catch {
    return new Response("Invalid signature.", { status: 400 });
  }

  if (event.type === "user.deleted" && event.data.id) {
    const user = await userRepository.findByClerkId(event.data.id);
    if (user) await removeAccountData(user.id, { keepRecipes: true });
  }

  return new Response(null, { status: 204 });
}
