import { requireApiUser } from "@/lib/api";
import type { CookbookList } from "@/lib/api-types";
import { listUserCookbooks } from "@/server/services/cookbook.service";

/** The library: every cookbook the user belongs to. */
export async function GET(): Promise<Response> {
  const { user, response } = await requireApiUser();
  if (response) return response;

  const cookbooks = await listUserCookbooks(user.id);
  return Response.json({ cookbooks } satisfies CookbookList);
}
