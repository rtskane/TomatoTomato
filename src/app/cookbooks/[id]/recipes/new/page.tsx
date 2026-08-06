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
        className="text-sm text-black/60 hover:underline dark:text-white/60"
      >
        ← {cookbook.title}
      </Link>

      <h1 className="mt-4 text-2xl font-semibold">New recipe</h1>
      <p className="mt-2 text-sm text-black/70 dark:text-white/70">
        Adding to <span className="font-medium">{cookbook.title}</span>.
      </p>

      <div className="mt-8">
        <RecipeForm action={action} cookbookId={cookbook.id} />
      </div>
    </div>
  );
}
