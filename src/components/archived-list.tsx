"use client";

import { useActionState } from "react";
import ConfirmDialog, { type ConfirmState } from "./confirm-dialog";

// Archived things, the way back, and the way out for good — shared by the
// dashboard's archived cookbooks and a cookbook's archived recipes. Renders
// nothing when the list is empty, so the container never has to branch and
// someone who has never archived anything never sees the concept.

type RowAction = (
  state: ConfirmState,
  formData: FormData,
) => Promise<ConfirmState>;

/**
 * Each item carries its own already-bound actions. Binding happens in the
 * container, not here: a Server Component can only hand a Client Component
 * functions that are Server Actions, so an `(id) => action` factory wouldn't
 * survive the boundary — and binding server-side also means no id is ever
 * submitted from the browser.
 */
export type ArchivedListItem = {
  id: string;
  title: string;
  /** A quiet second line, e.g. "3 recipes, kept". */
  detail?: string;
  restore: RowAction;
  deleteForever: RowAction;
};

function ArchivedRow({
  item,
  noun,
  deleteWarning,
}: {
  item: ArchivedListItem;
  noun: string;
  deleteWarning: string;
}) {
  const [state, restore, pending] = useActionState(item.restore, {});

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-subheadline font-medium">{item.title}</p>
        {item.detail ? (
          <p className="text-caption-1 text-foreground-tertiary">{item.detail}</p>
        ) : null}
        {state.error ? (
          <p role="alert" className="text-caption-1 text-error">
            {state.error}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <form action={restore}>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md px-3 py-1.5 text-subheadline font-medium text-foreground-secondary hover:bg-background-secondary disabled:opacity-60"
          >
            {pending ? "Restoring…" : "Restore"}
          </button>
        </form>

        <ConfirmDialog
          action={item.deleteForever}
          triggerLabel="Delete forever"
          triggerClassName="rounded-md px-3 py-1.5 text-subheadline text-error hover:bg-error/5"
          title={`Delete “${item.title}” forever?`}
          confirmLabel="Delete forever"
          pendingLabel="Deleting…"
        >
          <p>
            This {noun} will be deleted forever. {deleteWarning} This
            can&rsquo;t be undone.
          </p>
        </ConfirmDialog>
      </div>
    </li>
  );
}

export default function ArchivedList({
  items,
  noun,
  note,
  deleteWarning,
}: {
  items: ArchivedListItem[];
  /** "cookbook" / "recipe", for the delete prompt. */
  noun: string;
  /** Who can see the archived things, under the heading. */
  note: string;
  /** What else goes when one is deleted. */
  deleteWarning: string;
}) {
  if (items.length === 0) return null;

  return (
    <details className="mt-10 border-t border-border pt-6">
      <summary className="cursor-pointer text-subheadline font-medium text-foreground-secondary">
        Archived ({items.length})
      </summary>
      <p className="mt-2 text-caption-1 text-foreground-tertiary">{note}</p>
      <ul className="mt-2 divide-y divide-border-faint">
        {items.map((item) => (
          <ArchivedRow
            key={item.id}
            item={item}
            noun={noun}
            deleteWarning={deleteWarning}
          />
        ))}
      </ul>
    </details>
  );
}
