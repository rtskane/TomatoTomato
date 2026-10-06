import { notFound, requireApiUser } from "@/lib/api";
import type { CookbookDetail } from "@/lib/api-types";
import { getCookbookDetail } from "@/server/services/cookbook.service";

/**
 * One cookbook and its recipes. A non-member gets the same 404 as a missing
 * cookbook, as on the web: whether it exists is itself not theirs to learn.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { user, response } = await requireApiUser();
  if (response) return response;

  const { id } = await params;
  const cookbook = await getCookbookDetail(user.id, id);
  if (!cookbook) return notFound();

  return Response.json(cookbook satisfies CookbookDetail);
}
