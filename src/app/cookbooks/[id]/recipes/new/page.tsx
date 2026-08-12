import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/user";
import { getCookbookDetail } from "@/server/services/cookbook.service";
import { createRecipeAction } from "./actions";
import RecipeForm from "./recipe-form";

// Container: owns auth + data, and gates the whole page on permission before
// rendering a form the user isn't allowed to submit.
export default async function NewRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireOnboardedUser();
  const cookbook = await getCookbookDetail(user.id, id);

  // Not a member, or a VIEWER: same 404 either way. The service re-checks on
  // submit, so this is UX, not the security boundary.
  if (!cookbook || !cookbook.canAddRecipes) notFound();

  // Bind the cookbook id server-side so it can't be swapped by the client.
  const action = createRecipeAction.bind(null, cookbook.id);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link
        href={`/cookbooks/${cookbook.id}`}
        className="text-subheadline text-foreground-secondary hover:underline"
      >
        ← {cookbook.title}
      </Link>

      <h1 className="mt-4 text-title-1">New recipe</h1>
      <p className="mt-2 text-subheadline text-foreground-secondary">
        Adding to <span className="font-medium">{cookbook.title}</span>.
      </p>

      <div className="mt-8">
        <RecipeForm action={action} cookbookId={cookbook.id} />
      </div>
    </div>
  );
}
