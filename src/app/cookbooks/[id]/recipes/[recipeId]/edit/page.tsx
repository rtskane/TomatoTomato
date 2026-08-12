import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/user";
import { getRecipeDetail } from "@/server/services/recipe-detail.service";
import RecipeForm from "../../new/recipe-form";
import DeleteRecipe from "./delete-recipe";
import { updateRecipeAction, deleteRecipeAction } from "./actions";
import type { CreateRecipeValues } from "../../recipe-form-data";

// Container: owns auth + data, and gates the page on permission before
// rendering a form the user isn't allowed to submit.
export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ id: string; recipeId: string }>;
}) {
  const { id, recipeId } = await params;
  const user = await requireOnboardedUser();
  const recipe = await getRecipeDetail(user.id, id, recipeId);

  // Can't see it, or can see it but didn't write it and doesn't own the
  // cookbook: 404 either way. The service re-checks on submit, so this is UX,
  // not the security boundary.
  if (!recipe || !recipe.canModify) notFound();

  // The form speaks the wire format — every field a string, since that's what a
  // form gives back. Converting here keeps the form itself identical to the one
  // used for creating.
  const initialValues: CreateRecipeValues = {
    title: recipe.title,
    description: recipe.description ?? "",
    servings: recipe.servings?.toString() ?? "",
    prepTimeMinutes: recipe.prepTimeMinutes?.toString() ?? "",
    cookTimeMinutes: recipe.cookTimeMinutes?.toString() ?? "",
    ingredients: recipe.ingredients.map((ingredient) => ({
      name: ingredient.name,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      note: ingredient.note ?? "",
    })),
    steps: recipe.steps.map((step) => step.instruction),
  };

  // Both ids bound server-side so the client can't swap either.
  const save = updateRecipeAction.bind(null, id, recipeId);
  const remove = deleteRecipeAction.bind(null, id, recipeId);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link
        href={`/cookbooks/${id}/recipes/${recipeId}`}
        className="text-subheadline text-foreground-secondary hover:underline"
      >
        ← {recipe.title}
      </Link>

      <h1 className="mt-4 text-title-1">Edit recipe</h1>
      <p className="mt-2 text-subheadline text-foreground-secondary">
        In <span className="font-medium">{recipe.cookbook.title}</span>.
      </p>

      <div className="mt-8">
        <RecipeForm
          action={save}
          cookbookId={id}
          initialValues={initialValues}
          submitLabel="Save changes"
          pendingLabel="Saving…"
        />
      </div>

      {/* Below the form and visually separated: deleting is not one of the
          choices you're weighing while editing, and it can't be undone. */}
      <div className="mt-12 border-t border-border pt-6">
        <DeleteRecipe action={remove} recipeTitle={recipe.title} />
      </div>
    </div>
  );
}
