"use client";

import { useActionState, useState } from "react";

// A red text button that opens an "are you sure?" box in its own place, for a
// destructive action that lives inside a dialog already — archiving a
// cookbook, leaving one. (Outside a dialog, ConfirmDialog asks in a modal.)
//
// ## Focus
//
// The trigger unmounts when the box opens, and the box unmounts on Cancel, so
// without help keyboard focus falls to <body> — out of the surrounding dialog
// entirely. Opening moves it to Cancel rather than the destructive button, so
// a second Enter backs out instead of going ahead; Cancel hands it back to the
// trigger. `autoFocus` does both on mount. The trigger's is gated on having
// come back from the box, or it would steal focus whenever the dialog opened.

export type InlineConfirmState = { error?: string };

type InlineConfirmAction = (
  state: InlineConfirmState,
  formData: FormData,
) => Promise<InlineConfirmState>;

export default function InlineConfirm({
  action,
  triggerLabel,
  title,
  children,
  confirmLabel,
  pendingLabel,
}: {
  action: InlineConfirmAction;
  triggerLabel: string;
  title: string;
  /** What will happen, in plain words. */
  children: React.ReactNode;
  confirmLabel: string;
  pendingLabel: string;
}) {
  const [state, submit, pending] = useActionState(action, {});
  const [confirming, setConfirming] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        autoFocus={cancelled}
        onClick={() => setConfirming(true)}
        className="text-subheadline text-error hover:underline"
      >
        {triggerLabel}
      </button>
    );
  }

  return (
    <form
      action={submit}
      className="rounded-lg border border-border-error/40 bg-error/5 p-4"
    >
      <p className="text-subheadline font-medium">{title}</p>
      <p className="mt-1 text-subheadline text-foreground-secondary">
        {children}
      </p>

      {state.error ? (
        <p role="alert" className="mt-2 text-subheadline text-error">
          {state.error}
        </p>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-error px-3 py-1.5 text-subheadline font-medium text-foreground-inverse hover:bg-error-hover disabled:opacity-40"
        >
          {pending ? pendingLabel : confirmLabel}
        </button>
        <button
          type="button"
          autoFocus
          onClick={() => {
            setConfirming(false);
            setCancelled(true);
          }}
          disabled={pending}
          className="rounded-md px-3 py-1.5 text-subheadline text-foreground-secondary hover:bg-background-secondary disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
