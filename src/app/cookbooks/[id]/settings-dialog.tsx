"use client";

import { useActionState, useState } from "react";
import ModalDialog from "@/components/modal-dialog";
import type { UpdateCookbookState, ArchiveCookbookState } from "./settings-actions";
import type { ArchiveImpact } from "@/server/services/cookbook.service";

// Renaming a cookbook and archiving it. Owner-only — the page decides whether
// to render this at all.

type UpdateAction = (
  state: UpdateCookbookState,
  formData: FormData,
) => Promise<UpdateCookbookState>;

type ArchiveAction = (
  state: ArchiveCookbookState,
  formData: FormData,
) => Promise<ArchiveCookbookState>;

const fieldClass =
  "mt-1 w-full rounded-lg border border-border bg-background-control px-3 py-2 text-subheadline " +
  "outline-none placeholder:text-foreground-muted focus:border-border-input-strong focus:bg-transparent";

/** Wording that stays honest whether the cookbook is empty or holds five people's work. */
function impactSentence(impact: ArchiveImpact): string {
  if (impact.recipeCount === 0) return "It has no recipes in it.";

  const one = impact.recipeCount === 1;
  // The verb has to agree too — "Its 1 recipe go with it" was the first thing
  // visible in the dialog.
  const recipes = `${impact.recipeCount} ${one ? "recipe" : "recipes"}`;
  const verb = one ? "goes" : "go";

  if (impact.recipesByOthers === 0) {
    return `Its ${recipes} ${verb} with it — all yours.`;
  }
  return `Its ${recipes} ${verb} with it, including ${impact.recipesByOthers} written by other people.`;
}

function ArchiveSection({
  action,
  impact,
}: {
  action: ArchiveAction;
  impact: ArchiveImpact;
}) {
  const [state, submit, pending] = useActionState(action, {});
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");

  const matches = typed.trim() === impact.title.trim();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-subheadline text-error hover:underline"
      >
        Archive this cookbook
      </button>
    );
  }

  return (
    <form
      action={submit}
      className="rounded-lg border border-border-error/40 bg-error/5 p-4"
    >
      <p className="text-subheadline font-medium">Archive “{impact.title}”?</p>
      <p className="mt-1 text-subheadline text-foreground-secondary">
        It leaves everyone&rsquo;s library
        {impact.memberCount > 1
          ? ` — all ${impact.memberCount} members`
          : ""}
        . {impactSentence(impact)} Nothing is deleted, and you can restore it
        from your library.
      </p>

      <label htmlFor="confirmTitle" className="mt-3 block text-subheadline">
        Type <span className="font-medium">{impact.title}</span> to confirm
      </label>
      <input
        id="confirmTitle"
        name="confirmTitle"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        autoComplete="off"
        className={fieldClass}
      />

      {state.error ? (
        <p role="alert" className="mt-2 text-subheadline text-error">
          {state.error}
        </p>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          // Disabled until it matches, but the action re-checks the typed name
          // server-side — a confirmation only the client enforces is no
          // confirmation at all, since the action accepts direct POSTs.
          disabled={pending || !matches}
          className="rounded-md bg-error px-3 py-1.5 text-subheadline font-medium text-foreground-inverse hover:bg-error-hover disabled:opacity-40"
        >
          {pending ? "Archiving…" : "Archive"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="rounded-md px-3 py-1.5 text-subheadline text-foreground-secondary hover:bg-background-secondary disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function SettingsDialog({
  title,
  description,
  updateAction,
  archiveAction,
  impact,
}: {
  title: string;
  description: string | null;
  updateAction: UpdateAction;
  archiveAction: ArchiveAction;
  impact: ArchiveImpact;
}) {
  const [state, submit, pending] = useActionState(updateAction, {});

  return (
    <ModalDialog
      title="Cookbook settings"
      closeLabel="Close"
      triggerClassName="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-subheadline font-medium text-foreground-secondary hover:bg-background-secondary"
      triggerContent={
        <>
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
          >
            <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
          </svg>
          Settings
        </>
      }
    >
      <div className="space-y-8">
        <form action={submit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="title" className="block text-subheadline font-medium">
              Title
            </label>
            <input
              id="title"
              name="title"
              required
              defaultValue={state.values?.title ?? title}
              className={fieldClass}
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-subheadline font-medium">
              Description{" "}
              <span className="font-normal text-foreground-muted">
                optional
              </span>
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={state.values?.description ?? description ?? ""}
              className={`${fieldClass} resize-none`}
            />
          </div>

          {state.error ? (
            <p role="alert" className="text-subheadline text-error">
              {state.error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-accent px-4 py-2 text-subheadline font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
        </form>

        <div className="border-t border-border pt-6">
          <ArchiveSection action={archiveAction} impact={impact} />
        </div>
      </div>
    </ModalDialog>
  );
}
