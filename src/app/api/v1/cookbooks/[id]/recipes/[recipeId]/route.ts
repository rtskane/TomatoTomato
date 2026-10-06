import { notFound, requireApiUser } from "@/lib/api";
import type { RecipeDetail } from "@/lib/api-types";
import { getRecipeDetail } from "@/server/services/recipe-detail.service";

/**
 * One recipe, with everything cooking mode needs. No such recipe, the wrong
 * cookbook, and not a member all get the same 404.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; recipeId: string }> },
): Promise<Response> {
  const { user, response } = await requireApiUser();
  if (response) return response;

  const { id, recipeId } = await params;
  const recipe = await getRecipeDetail(user.id, id, recipeId);
  if (!recipe) return notFound();

  return Response.json(recipe satisfies RecipeDetail);
}
