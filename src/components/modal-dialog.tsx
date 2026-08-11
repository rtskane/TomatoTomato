"use client";

import { useEffect, useRef, useState } from "react";

// A trigger button and the modal it opens. Owns presentation and open/close
// only — content arrives as `children`, so it can stay server-rendered.
//
// ## Why a native <dialog>
//
// `showModal()` gives focus trapping, focus restore on close, Escape-to-close,
// inertness of the page behind, and a real top-layer backdrop — all things a
// div-with-a-fixed-overlay has to reimplement, usually incompletely. The only
// thing left to do by hand is dismissing on a backdrop click.
//
// Two of the classes below are load-bearing and were both wrong the first time:
// `m-auto`, because Tailwind's preflight resets the `margin: auto` that centres
// a modal dialog; and the underscores in `calc(100vw_-_2rem)`, because `calc`
// requires spaces around its operator and invalid CSS is dropped silently,
// leaving the dialog at its default `width: fit-content`.

export default function ModalDialog({
  title,
  triggerContent,
  triggerClassName,
  children,
  closeLabel = "Done",
}: {
  title: string;
  triggerContent: React.ReactNode;
  triggerClassName: string;
  children: React.ReactNode;
  closeLabel?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = `dialog-title-${title.replace(/\W+/g, "-").toLowerCase()}`;

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
        className={triggerClassName}
      >
        {triggerContent}
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
        aria-labelledby={titleId}
        className="m-auto w-[min(32rem,calc(100vw_-_2rem))] rounded-xl border border-black/10 bg-[var(--background)] p-0 text-[var(--foreground)] shadow-xl backdrop:bg-black/40 dark:border-white/15"
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="-mt-1 -mr-1 rounded-md p-1 text-black/40 hover:bg-black/5 hover:text-black/70 dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white/70"
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

        {/* Caps at the viewport so long content scrolls inside the dialog
            rather than pushing it off screen. */}
        <div className="max-h-[70vh] overflow-y-auto px-5 py-5">{children}</div>

        <div className="flex justify-end border-t border-black/10 px-5 py-3 dark:border-white/15">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md bg-black/5 px-4 py-2 text-sm font-medium hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20"
          >
            {closeLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}
