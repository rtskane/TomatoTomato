"use client";

import { useActionState } from "react";
import type { ArchiveCookbookState } from "../cookbooks/[id]/settings-actions";
import type { ArchivedCookbook } from "@/server/services/cookbook.service";

// The owner's archived cookbooks, and the way back. Renders nothing when there
// are none, so the container never has to branch — and someone who has never
// archived anything never sees the concept.
//
// Only the owner can see this: archiving hides a cookbook from every other
// member, and `listArchivedCookbooks` is scoped to `ownerId`.

type RestoreAction = (
  state: ArchiveCookbookState,
  formData: FormData,
) => Promise<ArchiveCookbookState>;

/**
 * Each row carries its own already-bound restore action. Binding happens in the
 * container, not here: a Server Component can only hand a Client Component
 * functions that are Server Actions, so a `(id) => action` factory wouldn't
 * survive the boundary — and binding server-side also means no cookbook id is
 * ever submitted from the browser.
 */
export type ArchivedItem = ArchivedCookbook & { restore: RestoreAction };

function ArchivedRow({
  cookbook,
  action,
}: {
  cookbook: ArchivedCookbook;
  action: RestoreAction;
}) {
  const [state, restore, pending] = useActionState(action, {});

  return (
    <li className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-subheadline font-medium">{cookbook.title}</p>
        <p className="text-caption-1 text-foreground-tertiary">
          {cookbook.recipeCount}{" "}
          {cookbook.recipeCount === 1 ? "recipe" : "recipes"}, kept
        </p>
        {state.error ? (
          <p role="alert" className="text-caption-1 text-error">
            {state.error}
          </p>
        ) : null}
      </div>

      <form action={restore}>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md px-3 py-1.5 text-subheadline font-medium text-foreground-secondary hover:bg-background-secondary disabled:opacity-60"
        >
          {pending ? "Restoring…" : "Restore"}
        </button>
      </form>
    </li>
  );
}

export default function ArchivedCookbooks({
  cookbooks,
}: {
  cookbooks: ArchivedItem[];
}) {
  if (cookbooks.length === 0) return null;

  return (
    <details className="mt-10 border-t border-border pt-6">
      <summary className="cursor-pointer text-subheadline font-medium text-foreground-secondary">
        Archived ({cookbooks.length})
      </summary>
      <p className="mt-2 text-caption-1 text-foreground-tertiary">
        Hidden from everyone, including members. Nothing was deleted.
      </p>
      <ul className="mt-2 divide-y divide-border-faint">
        {cookbooks.map((cookbook) => (
          <ArchivedRow
            key={cookbook.id}
            cookbook={cookbook}
            action={cookbook.restore}
          />
        ))}
      </ul>
    </details>
  );
}
