"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { unstable_rethrow, useRouter } from "next/navigation";
import BookCover from "@/components/book-cover";
import CoverEditor, { type CoverEditorResult } from "@/components/cover-editor";
import type { CoverDesign } from "@/lib/book-covers";
import { coverFields } from "@/lib/cover-fields";
import { FEATURED_TEMPLATES, blankDesign, templateDesign } from "@/lib/cover-templates";
import {
  DRAFT_KEY,
  EMPTY_DRAFT,
  isEmptyDraft,
  parseDraft,
  type CookbookDraft,
} from "@/lib/cookbook-draft";
import { setupPath } from "@/lib/setup-steps";
import { createCookbookAction } from "./actions";

/**
 * Name a cookbook and choose its cover, on one screen.
 *
 * Deliberately little to look at: a name, and one short row — "Design your
 * own" first, then a few ready-made covers. Each cover is drawn with the name
 * as typed. Under the row are the only two things to do next, side by side:
 * create the cookbook with the picked cover, or open that cover in the editor.
 *
 * An earlier version showed every template in a grid, with a large preview, a
 * colour picker and the buttons off in a side column. With that much on the
 * page the way into the editor was hard to find — and the editor is where
 * colour, pattern and everything else already live. So the choices here are
 * few, and anything finer is one obvious button away.
 *
 * Both ways through end in the same call with the same data: a template is
 * just a cover somebody already designed (see lib/cover-templates.ts).
 *
 * ## Nothing exists until "Create cookbook"
 *
 * So the work in flight is kept in the browser and restored on return. The
 * page is rendered on the server with nothing chosen, and the stored draft
 * can only be read in the browser — so the picker is mounted a second time,
 * once, after hydration, with the draft to start from. `useSyncExternalStore`
 * is what says "we are in the browser now" without a hydration mismatch.
 */

const DEFAULT_TEMPLATE = FEATURED_TEMPLATES[0];

const noSubscription = () => () => {};

// Private browsing, a full disk or blocked site data can make storage throw.
// A draft is a convenience: without it the page simply starts empty.
function readStoredDraft(): CookbookDraft | null {
  try {
    return parseDraft(window.localStorage.getItem(DRAFT_KEY));
  } catch {
    return null;
  }
}

function writeStoredDraft(draft: CookbookDraft | null) {
  try {
    if (draft === null || isEmptyDraft(draft)) window.localStorage.removeItem(DRAFT_KEY);
    else window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Nothing to do: the draft just won't survive a reload.
  }
}

export default function NewCookbook() {
  const inBrowser = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  // The key remounts the picker once it can read the draft, so its state
  // starts from what was stored rather than having to be patched afterwards.
  return <Picker key={inBrowser ? "browser" : "server"} restore={inBrowser} />;
}

function Picker({ restore }: { restore: boolean }) {
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);

  const [restored] = useState(() => (restore ? readStoredDraft() : null));
  const initial = restored ?? { ...EMPTY_DRAFT, templateId: DEFAULT_TEMPLATE.id };

  const [title, setTitle] = useState(initial.title);
  const [templateId, setTemplateId] = useState(initial.templateId);
  const [custom, setCustom] = useState(initial.custom);
  const [showRestored, setShowRestored] = useState(restored !== null);

  const [editing, setEditing] = useState<CoverDesign | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Once the cookbook exists the draft is gone for good; this stops the
  // effect below writing it back in the moment before the page changes.
  const createdRef = useRef(false);

  // A stored draft can name a cover this page no longer offers; that falls
  // back to their own design if they have one, and the first cover if not.
  const template =
    FEATURED_TEMPLATES.find((t) => t.id === templateId) ?? (custom ? null : DEFAULT_TEMPLATE);
  // What "Create cookbook" would make right now.
  const design: CoverDesign = template ? templateDesign(template) : (custom as CoverDesign);
  const shownTitle = title.trim() || "Your cookbook";

  useEffect(() => {
    if (!restore || createdRef.current) return;
    writeStoredDraft({ title, templateId, custom });
  }, [restore, title, templateId, custom]);

  function startOver() {
    setTitle("");
    setTemplateId(DEFAULT_TEMPLATE.id);
    setCustom(null);
    setShowRestored(false);
    setError(null);
    nameRef.current?.focus();
  }

  function create(name: string, cover: CoverDesign) {
    // Enter in the name field can arrive again while the first is in flight.
    if (pending || createdRef.current) return;
    if (name.trim() === "") {
      setError("Give your cookbook a name.");
      // Only reachable from the page: the editor has its own name field.
      nameRef.current?.focus();
      return;
    }
    setError(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof createCookbookAction>>;
      try {
        result = await createCookbookAction({ title: name, cover: coverFields(cover) });
      } catch (cause) {
        // The action's auth gate redirects by throwing; that is Next's to
        // handle, not a failure to report.
        unstable_rethrow(cause);
        // Anything else is the call itself not getting through — offline, or
        // the server falling over. Left uncaught it would replace the whole
        // page with the error screen; said here, the work stays on screen (and
        // in the draft) to try again.
        setError("That didn't go through. Check your connection and try again.");
        return;
      }
      if ("error" in result) {
        setError(result.error);
        return;
      }
      createdRef.current = true;
      writeStoredDraft(null);
      router.push(setupPath(result.id, "invite"));
    });
  }

  /** The editor closed: keep what it made as their own design, and select it. */
  function keepDesign(result: CoverEditorResult, opened: CoverDesign) {
    setTitle(result.title);
    // Opened and closed without touching the cover: leave the pick alone.
    if (result.design !== opened) {
      setCustom(result.design);
      setTemplateId(null);
    }
  }

  const customSelected = template === null;
  const tileSizes = "(min-width: 768px) 160px, 30vw";

  return (
    <div className="mt-8">
      <label htmlFor="cookbook-name" className="block text-subheadline font-medium">
        Name
      </label>
      <input
        ref={nameRef}
        id="cookbook-name"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          if (error) setError(null);
        }}
        onKeyDown={(e) => {
          // Not while an input method is composing: there, Enter confirms the
          // characters being typed, and the name isn't finished.
          if (e.key === "Enter" && !e.nativeEvent.isComposing) create(title, design);
        }}
        maxLength={80}
        autoComplete="off"
        placeholder="Weeknight Dinners"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "create-error" : undefined}
        className="mt-1 w-full max-w-md rounded-md border border-border-strong bg-transparent px-3 py-2 text-headline outline-none placeholder:font-normal placeholder:text-foreground-muted focus:border-border-input-strong"
      />

      {showRestored ? (
        <p className="mt-2 text-caption-1 text-foreground-secondary">
          Picked up where you left off.{" "}
          <button type="button" onClick={startOver} className="underline hover:text-foreground">
            Start over
          </button>
        </p>
      ) : null}

      <h2 className="mt-8 text-headline font-semibold">Choose a cover</h2>
      <p className="mt-1 text-subheadline text-foreground-secondary">
        Design your own, or start with one of these.
      </p>

      {/* One row on a wide screen, two short rows on a phone — three across
          there, so the buttons under them stay near the top of the screen.
          "Design your own" comes first: it is the way into the editor, and at
          the end of the row it was being missed. */}
      <ul className="mt-4 grid grid-cols-3 gap-x-2 gap-y-4 sm:gap-x-3 sm:gap-y-5 md:grid-cols-5">
        <li>
          {custom ? (
            <CoverTile
              label="Your design"
              selected={customSelected}
              onClick={() => setTemplateId(null)}
            >
              <BookCover
                title={shownTitle}
                design={custom}
                sizes={tileSizes}
                className="aspect-3/4 w-full shadow-md"
              />
            </CoverTile>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(blankDesign(design.coverColor))}
              className="group block w-full text-left outline-none"
            >
              {/* Padded like a cover's tile, so the dashed board is the same
                  size as the books beside it. */}
              <span className="block rounded-lg p-1.5 group-focus-visible:ring-2 group-focus-visible:ring-border-input-strong">
                <span className="flex aspect-3/4 w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border-strong text-foreground-secondary transition-colors group-hover:border-foreground-secondary group-hover:bg-background-secondary group-hover:text-foreground">
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    className="size-7"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
              </span>
              <span className="mt-1 block px-1.5 text-subheadline font-medium">
                Design your own
              </span>
            </button>
          )}
        </li>

        {FEATURED_TEMPLATES.map((t) => (
          <li key={t.id}>
            <CoverTile
              label={t.name}
              selected={t.id === template?.id}
              onClick={() => setTemplateId(t.id)}
            >
              <BookCover
                title={shownTitle}
                design={templateDesign(t)}
                sizes={tileSizes}
                className="aspect-3/4 w-full shadow-md"
              />
            </CoverTile>
          </li>
        ))}
      </ul>

      {/* The two things to do with the picked cover, together and directly
          under it: use it as it is, or open it in the editor.

          On a phone the bar sticks to the bottom of the screen, so "Create
          cookbook" is in reach however far the covers have scrolled — and
          what went wrong is said inside it, where it can't be scrolled out of
          sight while focus jumps back up to the name. */}
      <div className="sticky bottom-0 -mx-4 mt-6 border-t border-border bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:border-0 sm:p-0">
        {error ? (
          <p id="create-error" role="alert" className="mb-3 text-subheadline text-error sm:mb-6">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => create(title, design)}
            disabled={pending}
            className="flex-1 rounded-md bg-accent px-3 py-2.5 text-subheadline font-medium whitespace-nowrap text-on-accent hover:bg-accent-hover disabled:opacity-60 sm:flex-none sm:px-4 sm:text-body"
          >
            {pending ? "Creating…" : "Create cookbook"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(design)}
            disabled={pending}
            className="flex-1 rounded-md border border-border-strong px-3 py-2.5 text-subheadline font-medium whitespace-nowrap hover:bg-background-secondary disabled:opacity-60 sm:flex-none sm:px-4 sm:text-body"
          >
            {customSelected ? "Edit your design" : "Customise this cover"}
          </button>
          {/* Left off a phone, where the bar is for the two ways forward and
              the site's own header is the way out. */}
          <Link
            href="/dashboard"
            className="ml-1 hidden text-subheadline text-foreground-secondary hover:underline sm:inline"
          >
            Cancel
          </Link>
        </div>
      </div>

      {editing ? (
        <CoverEditor
          title={title}
          design={editing}
          closeLabel="Covers"
          onClose={(result) => {
            keepDesign(result, editing);
            setEditing(null);
          }}
          action={{
            label: "Create cookbook",
            shortLabel: "Create",
            pendingLabel: "Creating…",
            pending,
            error,
            run: (result) => {
              // Kept first, so a refused create leaves the work on the page
              // (and in the draft) rather than only inside the editor.
              keepDesign(result, editing);
              create(result.title, result.design);
            },
          }}
        />
      ) : null}
    </div>
  );
}

/** One cover in the grid: the book itself, its name, and whether it is the pick. */
function CoverTile({
  label,
  selected,
  onClick,
  children,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className="group block w-full text-left outline-none"
    >
      <span
        className={`block rounded-lg p-1.5 transition-shadow group-focus-visible:ring-2 group-focus-visible:ring-border-input-strong ${
          selected ? "ring-2 ring-foreground" : "ring-1 ring-transparent group-hover:ring-border-strong"
        }`}
      >
        {/* The book is a picture of the choice; the label below names it. */}
        <span aria-hidden className="block">
          {children}
        </span>
      </span>
      <span
        className={`mt-1 block px-1.5 text-subheadline ${
          selected ? "font-semibold" : "font-medium text-foreground-secondary"
        }`}
      >
        {label}
      </span>
    </button>
  );
}
