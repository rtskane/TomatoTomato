"use client";

import { useEffect, useRef, useState } from "react";

// The Share button and the dialog it opens. Owns presentation and open/close
// only — the people-management UI arrives as `children`, server-rendered, so
// nothing about members or invites is bundled into this client component.
//
// ## Why a native <dialog>
//
// `showModal()` gives focus trapping, focus restore on close, Escape-to-close,
// inertness of the page behind, and a real top-layer backdrop — all things a
// div-with-a-fixed-overlay has to reimplement, usually incompletely. The only
// thing left to do by hand is dismissing on a backdrop click.
//
// ## Why not an intercepting route
//
// Next.js can render this as an intercepted `/members` route with a shareable
// URL, but a share dialog isn't a place — it's a control on the cookbook page,
// and Google Docs' own doesn't change the URL either. Routing it would also put
// a server round trip between the click and the dialog appearing. The content
// is already on the page, so opening is instant. `/cookbooks/[id]/members`
// still exists as a real page for deep links and for no-JS clients.

export default function ShareDialog({
  cookbookTitle,
  memberCount,
  children,
}: {
  cookbookTitle: string;
  memberCount: number;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  // showModal() can't be an attribute — the top layer is only reachable through
  // the imperative API, so opening is a DOM side effect keyed off React state.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/10"
      >
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
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M19 8v6M22 11h-6" />
        </svg>
        Share
        {memberCount > 1 ? (
          <span className="text-black/40 dark:text-white/40">
            {memberCount}
          </span>
        ) : null}
      </button>

      <dialog
        ref={dialogRef}
        // Escape and the close button both fire `close`; syncing state here
        // means every dismissal path runs through one place.
        onClose={() => setOpen(false)}
        // Clicking the backdrop targets the dialog itself — anything inside it
        // reports that child as the target instead.
        onClick={(e) => {
          if (e.target === dialogRef.current) setOpen(false);
        }}
        aria-labelledby="share-dialog-title"
        // `m-auto` is load-bearing: a modal dialog is centred by the user-agent
        // stylesheet's `margin: auto`, which Tailwind's preflight resets to 0.
        // Without it the dialog pins to the top-left corner.
        // Underscores are Tailwind's escape for the spaces `calc` requires
        // around an operator — `calc(100vw-2rem)` is invalid CSS and gets
        // dropped, leaving the dialog at its default `width: fit-content`.
        className="m-auto w-[min(32rem,calc(100vw_-_2rem))] rounded-xl border border-black/10 bg-[var(--background)] p-0 text-[var(--foreground)] shadow-xl backdrop:bg-black/40 dark:border-white/15"
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <h2 id="share-dialog-title" className="text-lg font-semibold">
            Share &ldquo;{cookbookTitle}&rdquo;
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded-md p-1 text-black/40 hover:bg-black/5 hover:text-black/70 dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white/70"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              className="size-5"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Caps at the viewport so a long member list scrolls inside the dialog
            rather than pushing it off screen. */}
        <div className="max-h-[70vh] overflow-y-auto px-5 py-5">{children}</div>

        <div className="flex justify-end border-t border-black/10 px-5 py-3 dark:border-white/15">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md bg-black/5 px-4 py-2 text-sm font-medium hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20"
          >
            Done
          </button>
        </div>
      </dialog>
    </>
  );
}
