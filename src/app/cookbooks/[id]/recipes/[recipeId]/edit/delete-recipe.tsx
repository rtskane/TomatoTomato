"use client";

import { useActionState, useState } from "react";
import type { DeleteRecipeState } from "./actions";

// Deleting a recipe is permanent — ingredients and steps cascade with it, and
// there's no archive for recipes the way there is for cookbooks. So the button
// doesn't delete; it reveals a confirmation that names what's about to go.

type DeleteAction = (
  state: DeleteRecipeState,
  formData: FormData,
) => Promise<DeleteRecipeState>;

const initialState: DeleteRecipeState = {};

export default function DeleteRecipe({
  action,
  recipeTitle,
}: {
  action: DeleteAction;
  recipeTitle: string;
}) {
  const [state, submit, pending] = useActionState(action, initialState);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-subheadline text-error hover:underline"
        >
          Delete this recipe
        </button>
        {state.error ? (
          <p role="alert" className="mt-2 text-subheadline text-error">
            {state.error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border-error/40 bg-error/5 p-4">
      <p className="text-subheadline font-medium">
        Delete &ldquo;{recipeTitle}&rdquo;?
      </p>
      <p className="mt-1 text-subheadline text-foreground-secondary">
        Its ingredients and steps go with it. This can&rsquo;t be undone.
      </p>

      {state.error ? (
        <p role="alert" className="mt-2 text-subheadline text-error">
          {state.error}
        </p>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <form action={submit}>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-error px-3 py-1.5 text-subheadline font-medium text-foreground-inverse hover:bg-error-hover disabled:opacity-60"
          >
            {pending ? "Deleting…" : "Delete recipe"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="rounded-md px-3 py-1.5 text-subheadline text-foreground-secondary hover:bg-background-secondary disabled:opacity-60"
        >
          Keep it
        </button>
      </div>
    </div>
  );
}
