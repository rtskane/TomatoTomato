import { ensureUser } from "@/lib/user";
import { unauthenticated } from "@/lib/api";
import type { AccountDeletionPreview } from "@/lib/api-types";
import { getAccountDeletionPreview } from "@/server/services/account.service";

/**
 * What deleting the account would do — whether to ask about recipes in
 * cookbooks other people will keep using. Fetch before `DELETE /api/v1/me`.
 */
export async function GET(): Promise<Response> {
  const user = await ensureUser();
  if (!user) return unauthenticated();

  // Null only when the account has already gone between those two lines.
  const preview = (await getAccountDeletionPreview(user.id)) ?? {
    recipesElsewhere: 0,
  };
  return Response.json(preview satisfies AccountDeletionPreview);
}
