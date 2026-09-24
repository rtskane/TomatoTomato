"use client";

import { useActionState } from "react";
import type { ArchiveRecipeState } from "./actions";

// Archiving a recipe takes it out of the cookbook without destroying it, so it
// needs no confirmation — the cookbook's archived list brings it back, and is
// the only place it can be deleted for good.

type ArchiveAction = (
  state: ArchiveRecipeState,
  formData: FormData,
) => Promise<ArchiveRecipeState>;

export default function ArchiveRecipe({ action }: { action: ArchiveAction }) {
  const [state, submit, pending] = useActionState(action, {});

  return (
    <form action={submit}>
      <button
        type="submit"
        disabled={pending}
        className="text-subheadline text-error hover:underline disabled:opacity-60"
      >
        {pending ? "Archiving…" : "Archive this recipe"}
      </button>
      <p className="mt-1 text-caption-1 text-foreground-tertiary">
        It leaves the cookbook for everyone. You can restore it, or delete it
        for good, from the Archived list at the bottom of the cookbook.
      </p>
      {state.error ? (
        <p role="alert" className="mt-2 text-subheadline text-error">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
