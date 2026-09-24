"use client";

import { useActionState, useEffect, useRef, useState } from "react";

// A button that asks "are you sure?" in a modal before running its action —
// the second of the two prompts in front of anything permanent. The first is
// the button itself; nothing else is asked of the person (no retyping names).
//
// A native <dialog> for the same reasons ModalDialog uses one: focus trapping,
// focus restore, Escape and the backdrop come with `showModal()`. The same two
// classes are load-bearing here too — `m-auto`, and the underscores inside
// `calc(...)` — see modal-dialog.tsx.

export type ConfirmState = { error?: string };

type ConfirmAction = (
  state: ConfirmState,
  formData: FormData,
) => Promise<ConfirmState>;

export default function ConfirmDialog({
  action,
  triggerLabel,
  triggerClassName,
  title,
  children,
  confirmLabel,
  pendingLabel,
}: {
  action: ConfirmAction;
  triggerLabel: string;
  triggerClassName: string;
  title: string;
  /** What will happen, in plain words. */
  children: React.ReactNode;
  confirmLabel: string;
  pendingLabel: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState(action, {});

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Nothing closes the dialog while the action runs: dismissing it mid-delete
  // would hide the error if one came back.
  const close = () => {
    if (!pending) setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName}
      >
        {triggerLabel}
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onCancel={(e) => {
          if (pending) e.preventDefault();
        }}
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
        aria-label={title}
        className="m-auto w-[min(26rem,calc(100vw_-_2rem))] rounded-xl border border-border bg-background p-5 text-foreground shadow-xl backdrop:bg-scrim"
      >
        <h2 className="text-headline font-semibold">{title}</h2>
        <div className="mt-2 text-subheadline text-foreground-secondary">
          {children}
        </div>

        {state.error ? (
          <p role="alert" className="mt-3 text-subheadline text-error">
            {state.error}
          </p>
        ) : null}

        <form action={submit} className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            disabled={pending}
            // Focus lands on Cancel when the dialog opens, so an accidental
            // Enter keeps the thing rather than destroying it.
            autoFocus
            className="rounded-md px-3 py-1.5 text-subheadline text-foreground-secondary hover:bg-background-secondary disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-error px-3 py-1.5 text-subheadline font-medium text-foreground-inverse hover:bg-error-hover disabled:opacity-60"
          >
            {pending ? pendingLabel : confirmLabel}
          </button>
        </form>
      </dialog>
    </>
  );
}
