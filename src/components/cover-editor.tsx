"use client";

import { useEffect, useId, useRef, useState } from "react";
import CoverCanvas from "@/components/cover-canvas";
import {
  BackgroundPanel,
  ElementPanel,
  PhotoPanel,
  ShapePanel,
  StickerPanel,
  TextPanel,
} from "@/components/cover-editor-panels";
import { useImageUpload } from "@/components/image-upload-field";
import { clampFraction, MIN_ZOOM, type CoverDesign } from "@/lib/book-covers";
import { canAdd, type CoverElement } from "@/lib/cover-elements";
import {
  asFreeform,
  createPhoto,
  duplicateElement,
  reink,
  removeElement,
  restack,
  styleFor,
  updateElement,
} from "@/lib/cover-editing";

/**
 * The cover editor: a full-screen workspace with the book in the middle, the
 * things you can put on it down one side, and the controls for whatever is
 * selected beside them.
 *
 * ## One document, one history
 *
 * Everything about the cover — the cloth, its weave, the background photo and
 * every placed element — is one `CoverDesign`, and undo steps through whole
 * designs. So changing the colour undoes the same way moving a sticker does.
 * The cookbook's name is the one thing kept apart: it is a text field, and a
 * text field's own undo is the one people expect inside it.
 *
 * `liveRef` mirrors the design synchronously. A drag reports its end in the
 * same tick as its last move, before React has re-rendered, and the commit
 * has to compare against the design as it now is rather than as this render
 * last saw it.
 *
 * ## The name is on the cover
 *
 * The title is a text element tied to the cookbook's name (`role: "title"`),
 * so it can be dragged and styled like anything else — and typing in the name
 * field, in the bar or with the title selected, renames the cookbook and
 * redraws the cover at once. An older cover's fixed title plate is turned into
 * elements on the way in (`asFreeform`), so there is only one kind of cover in
 * here.
 *
 * ## Why the canvas is trustworthy
 *
 * It renders `BookCover` — the same component the shelf renders. It is not a
 * drawing of what the shelf will look like; it is the shelf's own book, larger.
 *
 * ## Leaving
 *
 * There is no "discard": closing hands back the cover as it stands, and the
 * caller decides what that means (the new-cookbook page keeps it as the draft;
 * settings shows it, waiting to be saved). Escape closes too, once nothing is
 * selected.
 */

/** How many steps of undo to keep. Plenty for one sitting with a cover. */
const HISTORY = 50;

type Tool = "background" | "text" | "photo" | "shape" | "sticker";

const TOOLS: { id: Tool; label: string; icon: React.ReactNode }[] = [
  {
    id: "background",
    label: "Background",
    icon: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M4 15l5-5 4 4 3-3 4 4" />
      </>
    ),
  },
  {
    id: "text",
    label: "Text",
    icon: <path d="M5 6V4h14v2M12 4v16M9 20h6" />,
  },
  {
    id: "photo",
    label: "Photo",
    icon: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="m4 18 5.5-5 3.5 3 3-2.5 4 3.5" />
      </>
    ),
  },
  {
    id: "shape",
    label: "Shapes",
    icon: (
      <>
        <rect x="3" y="3" width="10" height="10" rx="1" />
        <circle cx="15.5" cy="15.5" r="5.5" />
      </>
    ),
  },
  {
    id: "sticker",
    label: "Stickers",
    icon: (
      <>
        <path d="M20 13V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7z" />
        <path d="M20 13h-5a2 2 0 0 0-2 2v5" />
      </>
    ),
  },
];

export type CoverEditorResult = { title: string; design: CoverDesign };

/** A primary button beyond "close" — "Create cookbook", on the way in. */
export type CoverEditorAction = {
  label: string;
  /**
   * What the button says on a phone, where the bar also has to hold the name,
   * undo and redo: "Create" for "Create cookbook". The full label is still
   * the button's accessible name.
   */
  shortLabel?: string;
  pendingLabel: string;
  pending: boolean;
  error?: string | null;
  run: (result: CoverEditorResult) => void;
};

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
    >
      {children}
    </svg>
  );
}

export default function CoverEditor({
  title: initialTitle,
  design: initialDesign,
  onClose,
  closeLabel = "Done",
  action,
}: {
  title: string;
  /** The cover to open on, already resolved — what the shelf shows. */
  design: CoverDesign;
  /** Leave the editor, with the cover and the name as they now stand. */
  onClose: (result: CoverEditorResult) => void;
  closeLabel?: string;
  action?: CoverEditorAction;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const hintId = useId();

  const [title, setTitle] = useState(initialTitle);
  // The cover as the editor first shows it — an older cover's title plate
  // already turned into elements. Kept so "nothing was touched" can be told
  // apart from "edited back to where it started".
  const [opened] = useState<CoverDesign>(() => normalise(asFreeform(initialDesign)));
  const [design, setDesign] = useState(opened);
  const liveRef = useRef(design);
  // True once this editor is going away, so the dialog closing as part of
  // that isn't mistaken for the browser closing it underneath us.
  const leavingRef = useRef(false);
  const [past, setPast] = useState<CoverDesign[]>([]);
  const [future, setFuture] = useState<CoverDesign[]>([]);
  const typingRef = useRef<string | null>(null);
  const gestureStartRef = useRef<CoverDesign | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("background");
  const [focusText, setFocusText] = useState(0);

  const elements = design.coverElements;
  const selected = elements.find((e) => e.id === selectedId) ?? null;
  const index = selected ? elements.indexOf(selected) : -1;

  // The native modal gives the focus trap, the inert page behind and Escape.
  // Mounted only while open, so opening is simply mounting.
  useEffect(() => {
    const dialog = dialogRef.current;
    leavingRef.current = false;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      leavingRef.current = true;
      if (dialog?.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    if (!focusText) return;
    textRef.current?.focus();
    textRef.current?.select();
  }, [focusText]);

  // ---- History ------------------------------------------------------------

  function setLive(next: CoverDesign) {
    const settled = normalise(next);
    liveRef.current = settled;
    setDesign(settled);
  }

  function remember(before: CoverDesign) {
    setPast((p) => [...p, before].slice(-HISTORY));
    setFuture([]);
  }

  /**
   * Change the cover as one step of undo. `typing` names a run of changes that
   * should collapse into a single step — the letters of one word, the ticks
   * of one slider drag.
   */
  function apply(next: CoverDesign, typing?: string) {
    const before = liveRef.current;
    setLive(next);
    if (!typing || typing !== typingRef.current) remember(before);
    typingRef.current = typing ?? null;
  }

  function applyElements(next: CoverElement[], typing?: string) {
    apply({ ...liveRef.current, coverElements: next }, typing);
  }

  /**
   * A gesture on the canvas moved something. The cover as it stood when the
   * gesture began is kept — the very object, not a copy — so undoing the
   * gesture puts that object back, and an editor undone all the way still
   * knows it holds the cover it opened with (see `result`).
   */
  function liveGesture(next: CoverElement[]) {
    gestureStartRef.current ??= liveRef.current;
    setLive({ ...liveRef.current, coverElements: next });
  }

  /** A gesture on the canvas ended: one step of undo, if it changed anything. */
  function commitGesture() {
    typingRef.current = null;
    const start = gestureStartRef.current;
    gestureStartRef.current = null;
    if (start && start !== liveRef.current) remember(start);
  }

  /** Step to another point in history, letting go of a selection it removes. */
  function travel(to: CoverDesign) {
    typingRef.current = null;
    setLive(to);
    if (!to.coverElements.some((e) => e.id === selectedId)) setSelectedId(null);
  }

  function undo() {
    const previous = past.at(-1);
    if (!previous) return;
    setPast(past.slice(0, -1));
    setFuture([liveRef.current, ...future]);
    travel(previous);
  }

  function redo() {
    const [next, ...rest] = future;
    if (!next) return;
    setFuture(rest);
    setPast([...past, liveRef.current]);
    travel(next);
  }

  // ---- Selection and the elements ----------------------------------------

  function select(id: string | null) {
    typingRef.current = null;
    setSelectedId(id);
  }

  function add(element: CoverElement | null) {
    if (!element) return;
    applyElements([...liveRef.current.coverElements, element]);
    select(element.id);
    // A new text box is for typing in, so go straight to its words.
    if (element.type === "text") setFocusText((n) => n + 1);
  }

  function deleteElement(id: string) {
    applyElements(removeElement(liveRef.current.coverElements, id));
    select(null);
    // Focus was on the thing that just went; put it somewhere that still
    // exists rather than letting it fall out of the editor.
    boardRef.current?.focus();
  }

  // ---- Uploads ------------------------------------------------------------

  const photoUpload = useImageUpload("cookbook-covers", {
    onUploaded: (url) => {
      const element = createPhoto(liveRef.current.coverElements, url, 1);
      add(element);
      if (!element) return;
      // Sized square until the picture says otherwise, then fitted to its
      // own proportions so nothing is cropped until the owner crops it.
      const probe = new window.Image();
      probe.onload = () => {
        const current = liveRef.current.coverElements.find((e) => e.id === element.id);
        if (current?.type !== "photo" || current.h !== element.h) return;
        const fitted = createPhoto([], url, probe.naturalHeight / probe.naturalWidth);
        if (!fitted) return;
        setLive({
          ...liveRef.current,
          coverElements: updateElement(liveRef.current.coverElements, element.id, {
            h: fitted.h,
          }),
        });
      };
      probe.src = url;
    },
  });

  // Leaving mid-upload would hand back a cover without the picture that was
  // just chosen, with nothing to show why.
  const uploading = photoUpload.uploading;

  // ---- Leaving ------------------------------------------------------------

  /**
   * The cover and the name as they stand. An untouched cover is handed back
   * as the very object that came in, so the caller can tell — and so merely
   * looking at an older cover doesn't rewrite its title plate as elements.
   */
  function result(): CoverEditorResult {
    return { title, design: liveRef.current === opened ? initialDesign : liveRef.current };
  }

  // Undo and redo from the keyboard, anywhere in the editor — except in a
  // text box, where the browser's own undo of the typing is the one wanted.
  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea")) return;
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
  }

  const isPhoto = Boolean(design.coverImageUrl);
  const barButton =
    "rounded-md p-2 text-foreground-secondary hover:bg-background-secondary disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <dialog
      ref={dialogRef}
      aria-label="Cover editor"
      onCancel={(event) => {
        // Escape leaves, keeping the work — and not at all mid-upload.
        event.preventDefault();
        event.stopPropagation();
        if (!uploading) onClose(result());
      }}
      onClose={(event) => {
        // React hands a nested dialog's `close` to its ancestors' handlers,
        // and this editor opens over the settings dialog — which would take
        // it as its own and shut. It goes no further than here.
        event.stopPropagation();
        // The browser can close a modal without asking (a second Escape,
        // for one). If that happens while the editor is still wanted, leave
        // properly rather than sit open-but-invisible.
        if (leavingRef.current || dialogRef.current?.open) return;
        onClose(result());
      }}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none flex-col bg-background p-0 text-foreground open:flex"
    >
      {/* ---- The bar: where you are, what it's called, undo, and out ---- */}
      <header className="relative flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 sm:gap-3 sm:px-4">
        {action ? (
          <button
            type="button"
            onClick={() => onClose(result())}
            disabled={uploading}
            // Named here because on a phone only the arrow shows.
            aria-label={closeLabel}
            // Square on a phone, where only the arrow shows and a thumb has to
            // find it.
            className="flex min-w-9 shrink-0 items-center justify-center gap-1 rounded-md py-2 text-subheadline font-medium text-foreground-secondary hover:text-foreground disabled:opacity-50 sm:justify-start sm:pr-2"
          >
            <Icon>
              <path d="m15 18-6-6 6-6" />
            </Icon>
            <span className="hidden sm:inline">{closeLabel}</span>
          </button>
        ) : null}

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          aria-label="Cookbook name"
          placeholder="Name your cookbook"
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-headline font-semibold outline-none placeholder:font-normal placeholder:text-foreground-muted hover:border-border focus:border-border-input-strong sm:max-w-sm"
        />

        {/* Undo and redo. In the bar on a wide screen; on a phone the bar has
            no room for them beside the name, so they hang just under it, one
            above the other down the edge of the stage — in the margin beside
            the book, which is kept narrow enough there to leave them one. One
            pair of buttons either way. */}
        <div className="absolute top-full left-1 z-10 mt-1 flex shrink-0 flex-col items-center gap-1 rounded-lg bg-background p-0.5 shadow-sm md:static md:mt-0 md:ml-auto md:flex-row md:bg-transparent md:p-0 md:shadow-none">
          <button
            type="button"
            onClick={undo}
            disabled={past.length === 0}
            aria-label="Undo"
            title="Undo"
            className={barButton}
          >
            <Icon>
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
            </Icon>
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={future.length === 0}
            aria-label="Redo"
            title="Redo"
            className={barButton}
          >
            <Icon>
              <path d="m15 14 5-5-5-5" />
              <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
            </Icon>
          </button>
        </div>

        <div className="ml-auto flex shrink-0 items-center md:ml-0">
          <button
            type="button"
            onClick={() => (action ? action.run(result()) : onClose(result()))}
            disabled={uploading || action?.pending}
            aria-label={action && !action.pending ? action.label : undefined}
            className="ml-1 rounded-md bg-accent px-3 py-2 text-subheadline font-medium whitespace-nowrap text-on-accent hover:bg-accent-hover disabled:opacity-60 sm:px-4"
          >
            {!action ? (
              closeLabel
            ) : action.pending ? (
              action.pendingLabel
            ) : action.shortLabel ? (
              <>
                <span className="sm:hidden">{action.shortLabel}</span>
                <span className="hidden sm:inline">{action.label}</span>
              </>
            ) : (
              action.label
            )}
          </button>
        </div>
      </header>

      {action?.error ? (
        // Indented on a phone to clear undo and redo, which hang over this corner.
        <p
          role="alert"
          className="shrink-0 bg-background-secondary py-2 pr-4 pl-24 text-subheadline text-error md:pl-4"
        >
          {action.error}
        </p>
      ) : null}

      {/* ---- The workspace ----
          A row on a wide screen: rail, panel, stage. A column on a phone,
          re-ordered so the book is on top, its controls under it and the rail
          along the bottom where a thumb is. */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav
          aria-label="Add to the cover"
          // Along the bottom on a phone, clear of the home indicator.
          className="order-3 flex shrink-0 justify-around border-t border-border bg-background px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] md:order-1 md:w-20 md:flex-col md:justify-start md:gap-1 md:border-t-0 md:border-r md:px-2 md:py-3"
        >
          {TOOLS.map((t) => {
            const active = !selected && tool === t.id;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setTool(t.id);
                  select(null);
                }}
                className={`flex min-w-14 flex-1 flex-col items-center gap-1 rounded-lg px-1 py-2 text-caption-1 font-medium transition-colors md:flex-none ${
                  active
                    ? "bg-background-secondary text-foreground"
                    : "text-foreground-secondary hover:bg-background-secondary hover:text-foreground"
                }`}
              >
                <Icon>{t.icon}</Icon>
                {t.label}
              </button>
            );
          })}
        </nav>

        <section
          aria-label={selected ? "Selected element" : TOOLS.find((t) => t.id === tool)?.label}
          // A fixed share of the screen on a phone, not "as tall as its
          // content": the stage takes what is left, so a panel that grew and
          // shrank with each tool resized the book under the thumb.
          className="order-2 h-[34dvh] shrink-0 overflow-y-auto border-t border-border bg-background px-4 py-4 md:h-auto md:w-72 md:border-t-0 md:border-r"
        >
          {selected ? (
            <ElementPanel
              element={selected}
              title={title}
              onTitleChange={setTitle}
              textRef={textRef}
              onChange={(patch, typing) =>
                applyElements(
                  updateElement(liveRef.current.coverElements, selected.id, patch),
                  typing ? `${selected.id}:${Object.keys(patch).join()}` : undefined,
                )
              }
              onDelete={() => deleteElement(selected.id)}
              onDuplicate={() => {
                const copied = duplicateElement(liveRef.current.coverElements, selected.id);
                if (!copied) return;
                applyElements(copied.elements);
                select(copied.copy.id);
              }}
              onRestack={(direction) =>
                applyElements(restack(liveRef.current.coverElements, selected.id, direction))
              }
              onDone={() => select(null)}
              canDuplicate={canAdd(elements, selected.type)}
              isTop={index === elements.length - 1}
              isBottom={index === 0}
            />
          ) : tool === "background" ? (
            <BackgroundPanel
              design={design}
              onColor={(color) =>
                apply({
                  ...liveRef.current,
                  coverColor: color,
                  coverElements: reink(
                    liveRef.current.coverElements,
                    liveRef.current.coverColor,
                    color,
                  ),
                })
              }
              onTexture={(coverTexture) => apply({ ...liveRef.current, coverTexture })}
              onZoom={(coverZoom) => apply({ ...liveRef.current, coverZoom }, "zoom")}
              onRemovePhoto={() =>
                apply({
                  ...liveRef.current,
                  coverImageUrl: null,
                  coverFocalX: 0.5,
                  coverFocalY: 0.5,
                  coverZoom: MIN_ZOOM,
                })
              }
            />
          ) : tool === "text" ? (
            <TextPanel elements={elements} coverColor={design.coverColor} onAdd={add} />
          ) : tool === "photo" ? (
            <PhotoPanel elements={elements} upload={photoUpload} />
          ) : tool === "shape" ? (
            <ShapePanel elements={elements} coverColor={design.coverColor} onAdd={add} />
          ) : (
            <StickerPanel elements={elements} onAdd={add} />
          )}
        </section>

        {/* The stage is a size container so the book can be as large as the
            space allows in *either* direction: 3:4, so 60% of the height is
            the widest it can be before it runs out of room top and bottom. On
            a phone it also stops at 68% of the width, which leaves the margin
            undo and redo sit in. */}
        <div className="relative order-1 flex min-h-0 flex-1 items-center justify-center bg-background-secondary [container-type:size] md:order-3">
          <div className="w-[min(68cqw,60cqh,28rem)] md:w-[min(80cqw,60cqh,28rem)]">
            <CoverCanvas
              title={title}
              design={design}
              selectedId={selectedId}
              onSelect={select}
              onLiveChange={liveGesture}
              onCommit={commitGesture}
              onDelete={deleteElement}
              onEditText={(id) => {
                select(id);
                setFocusText((n) => n + 1);
              }}
              onReframe={(dx, dy) =>
                apply(
                  {
                    ...liveRef.current,
                    coverFocalX: clampFraction(liveRef.current.coverFocalX + dx),
                    coverFocalY: clampFraction(liveRef.current.coverFocalY + dy),
                  },
                  "reframe",
                )
              }
              boardRef={boardRef}
              describedBy={hintId}
            />
          </div>

          <p
            id={hintId}
            className="pointer-events-none absolute inset-x-4 bottom-2 text-center text-caption-1 text-foreground-tertiary"
          >
            {selected
              ? "Drag to move. Pull a corner to resize, or the dot above to turn."
              : isPhoto
                ? "Tap something to select it. Drag the background to reframe the photo."
                : "Tap something on the cover to select it."}
          </p>
        </div>
      </div>
    </dialog>
  );
}

/**
 * Keep the stored style in step with what is on the cover, so the book is
 * drawn right while it is being edited: `BookCover` only shows a background
 * photo under PHOTO. See `styleFor` for what the three values mean now.
 */
function normalise(design: CoverDesign): CoverDesign {
  const coverStyle = styleFor(design);
  return design.coverStyle === coverStyle ? design : { ...design, coverStyle };
}
