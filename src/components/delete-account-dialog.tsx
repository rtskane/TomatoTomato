"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useClerk } from "@clerk/nextjs";
import {
  deleteAccountAction,
  loadAccountDeletionPreview,
} from "@/app/account/actions";
import type { AccountDeletionPreview } from "@/server/services/account.service";

// The "are you sure?" for deleting an account, opened from the user menu. It
// says what happens to their cookbooks, and asks the one question that's theirs
// to answer: what becomes of recipes they wrote in cookbooks other people will
// keep using.
//
// Controlled rather than owning its trigger like ConfirmDialog: the trigger is
// an item in Clerk's menu, which can only call back. Same native <dialog> and
// the same load-bearing classes — see modal-dialog.tsx.

export default function DeleteAccountDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { signOut } = useClerk();
  const [preview, setPreview] = useState<AccountDeletionPreview | null>(null);
  const [state, submit, pending] = useActionState(deleteAccountAction, {});
  const busy = pending || Boolean(state.deleted);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Read fresh each time it opens: cookbooks and members change between opens.
  // The last one is cleared on close, so a reopen never shows it stale.
  useEffect(() => {
    if (!open) return;
    let current = true;
    loadAccountDeletionPreview().then((p) => {
      if (current) setPreview(p);
    });
    return () => {
      current = false;
    };
  }, [open]);

  // The account is gone; the session in this browser is the last of it.
  useEffect(() => {
    if (state.deleted) void signOut({ redirectUrl: "/" });
  }, [state.deleted, signOut]);

  const closed = () => {
    setPreview(null);
    onClose();
  };
  const close = () => {
    if (!busy) closed();
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={closed}
      onCancel={(e) => {
        if (busy) e.preventDefault();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) close();
      }}
      aria-label="Delete your account"
      className="m-auto w-[min(28rem,calc(100vw_-_2rem))] rounded-xl border border-border bg-background p-5 text-foreground shadow-xl backdrop:bg-scrim"
    >
      <h2 className="text-headline font-semibold">Delete your account</h2>

      {preview ? (
        <form action={submit}>
          <div className="mt-2 space-y-3 text-subheadline text-foreground-secondary">
            <p>
              Your profile and everything that names you will be deleted. This
              can&apos;t be undone.
            </p>

            {/* One sentence rather than a line per cookbook: someone in dozens
                of them shouldn't have to scroll past a list to reach the
                question. */}
            <p>
              Cookbooks you share pass to another member. Ones only you are in
              are deleted, with every recipe in them.
            </p>

            {preview.recipesElsewhere > 0 ? (
              <fieldset className="space-y-2">
                <legend className="mb-2">
                  You&apos;ve written{" "}
                  {preview.recipesElsewhere === 1
                    ? "a recipe"
                    : `${preview.recipesElsewhere} recipes`}{" "}
                  in cookbooks other people will still be using. What should
                  happen to {preview.recipesElsewhere === 1 ? "it" : "them"}?
                </legend>
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="recipes"
                    value="keep"
                    required
                    disabled={busy}
                    className="mt-1"
                  />
                  <span>
                    Leave {preview.recipesElsewhere === 1 ? "it" : "them"} for
                    the cookbook, credited to &ldquo;a former member&rdquo;
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="recipes"
                    value="delete"
                    required
                    disabled={busy}
                    className="mt-1"
                  />
                  <span>
                    Delete {preview.recipesElsewhere === 1 ? "it" : "them"}
                  </span>
                </label>
              </fieldset>
            ) : null}
          </div>

          {state.error ? (
            <p role="alert" className="mt-3 text-subheadline text-error">
              {state.error}
            </p>
          ) : null}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              disabled={busy}
              // Focus lands on Cancel, so a stray Enter keeps the account.
              autoFocus
              className="rounded-md px-3 py-1.5 text-subheadline text-foreground-secondary hover:bg-background-secondary disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-error px-3 py-1.5 text-subheadline font-medium text-foreground-inverse hover:bg-error-hover disabled:opacity-60"
            >
              {state.deleted
                ? "Signing you out…"
                : pending
                  ? "Deleting…"
                  : "Delete account"}
            </button>
          </div>
        </form>
      ) : (
        <p className="mt-2 text-subheadline text-foreground-tertiary">
          Checking what you own…
        </p>
      )}
    </dialog>
  );
}
