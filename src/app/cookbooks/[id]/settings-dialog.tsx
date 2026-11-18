"use client";

import { useActionState, useState } from "react";
import ModalDialog from "@/components/modal-dialog";
import BookCover from "@/components/book-cover";
import CoverEditor from "@/components/cover-editor";
import InlineConfirm from "@/components/inline-confirm";
import type { UpdateCookbookState, ArchiveCookbookState } from "./settings-actions";
import type { ArchiveImpact } from "@/server/services/cookbook.service";
import type { CoverDesign } from "@/lib/book-covers";
import { COVER_FIELD_NAMES, coverFields } from "@/lib/cover-fields";

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
  return (
    <InlineConfirm
      action={action}
      triggerLabel="Archive this cookbook"
      title={`Archive “${impact.title}”?`}
      confirmLabel="Archive"
      pendingLabel="Archiving…"
    >
      It leaves everyone&rsquo;s library
      {impact.memberCount > 1
        ? ` — all ${impact.memberCount} members`
        : ""}
      . {impactSentence(impact)} Nothing is deleted: you can restore it, or
      delete it for good, from your library.
    </InlineConfirm>
  );
}

export default function SettingsDialog({
  title,
  description,
  design,
  updateAction,
  archiveAction,
  impact,
}: {
  title: string;
  description: string | null;
  /** Already resolved, so the editor opens on the cover the shelf shows. */
  design: CoverDesign;
  updateAction: UpdateAction;
  archiveAction: ArchiveAction;
  impact: ArchiveImpact;
}) {
  // The name and the cover are state rather than fields read off the DOM: the
  // editor changes both, over the top of this dialog, and hands them back.
  // They post through the title input and the hidden fields below.
  const [liveTitle, setLiveTitle] = useState(title);
  const [cover, setCover] = useState(design);
  const [editing, setEditing] = useState(false);
  // Whether the cover on screen is one the save hasn't seen yet — said out
  // loud, because closing the editor looks finished and isn't.
  const [coverChanged, setCoverChanged] = useState(false);
  const fields = coverFields(cover);

  const [state, submit, pending] = useActionState(
    async (previous: UpdateCookbookState, formData: FormData) => {
      const next = await updateAction(previous, formData);
      // Only once it is actually saved: a refused save (a blank title, say)
      // leaves the new cover still waiting, and the note has to keep saying so.
      if (!next.error) setCoverChanged(false);
      return next;
    },
    {},
  );

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
              value={liveTitle}
              onChange={(e) => setLiveTitle(e.target.value)}
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

          <div>
            <span className="block text-subheadline font-medium">Cover</span>
            <div className="mt-2 flex items-center gap-4">
              <div aria-hidden className="shrink-0">
                <BookCover
                  title={liveTitle.trim() || "Untitled cookbook"}
                  design={cover}
                  sizes="96px"
                  className="aspect-3/4 w-24 shadow-md"
                />
              </div>
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-md border border-border-strong px-3 py-1.5 text-subheadline font-medium hover:bg-background-secondary"
                >
                  Edit cover
                </button>
                {coverChanged ? (
                  <p role="status" className="mt-2 text-caption-1 text-foreground-secondary">
                    Cover changed. Save changes to keep it.
                  </p>
                ) : null}
              </div>
            </div>
            {COVER_FIELD_NAMES.map((name) => (
              <input key={name} type="hidden" name={name} value={fields[name]} />
            ))}
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

      {/* Outside the form: the editor has its own name field and buttons,
          and none of them should be this form's. It opens over the dialog. */}
      {editing ? (
        <CoverEditor
          title={liveTitle}
          design={cover}
          onClose={(result) => {
            setLiveTitle(result.title);
            if (result.design !== cover) {
              setCover(result.design);
              setCoverChanged(true);
            }
            setEditing(false);
          }}
        />
      ) : null}
    </ModalDialog>
  );
}
