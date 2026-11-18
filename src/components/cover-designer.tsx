"use client";

import { useEffect, useId, useRef, useState } from "react";
import CoverCanvas from "@/components/cover-canvas";
import CoverElementInspector, { elementLabel } from "@/components/cover-element-inspector";
import { Sticker } from "@/components/cover-stickers";
import ImageUploadField, { useImageUpload } from "@/components/image-upload-field";
import {
  BOOK_COVERS,
  TEXTURES,
  TITLE_FONTS,
  TITLE_SIZES,
  TITLE_POSITIONS,
  COVER_TEXTURES,
  COVER_TITLE_FONTS,
  COVER_TITLE_SIZES,
  COVER_TITLE_POSITIONS,
  MIN_ZOOM,
  MAX_ZOOM,
  clampFraction,
  clampZoom,
  type CoverDesign,
  type CoverStyle,
} from "@/lib/book-covers";
import {
  canAdd,
  LIMITS,
  SHAPE_KINDS,
  SHAPE_LABELS,
  STICKERS,
  type CoverElement,
  type ElementType,
  type ShapeKind,
} from "@/lib/cover-elements";
import {
  createPhoto,
  createShape,
  createSticker,
  createText,
  duplicateElement,
  removeElement,
  restack,
  updateElement,
} from "@/lib/cover-editing";
import { ACCEPTED_IMAGE_TYPES } from "@/lib/image-uploads";

/**
 * Design a cookbook's cover: pick the cloth and its weave, set the title, and
 * frame the photograph — watching the actual book the whole time.
 *
 * ## Why this owns its state
 *
 * The values it produces are submitted as ordinary form fields, but they are
 * held in React state rather than read off the DOM, for the same reason the
 * cover URL always was: an upload lands long after render, and a rejected
 * submit re-renders the form. State on a component that isn't remounted
 * survives both; a `defaultValue` on an input does not.
 *
 * The radios *are* the fields — `name="coverColor"` and friends post
 * themselves. Only the focal point needs hidden inputs, because its control is
 * a drag on the preview rather than something with a value attribute.
 *
 * Controls that don't apply right now still post their value in a hidden
 * field, so a title treatment survives a trip through Plain and back rather
 * than being silently reset by the save.
 *
 * ## The cloth and what sits on it
 *
 * A cover is two layers. The cloth — colour, weave, title plate, background
 * photo — is the composed cover it always was, chosen from the panel on the
 * right. On top of it go the placed elements: text, photos, shapes and
 * stickers, each dragged, resized and turned on the canvas itself (see
 * `CoverCanvas`). Selecting one swaps the panel for that element's controls;
 * letting go brings the cloth back.
 *
 * The elements post as one hidden JSON field. They are a list of differently
 * shaped things whose order matters, which a flat set of named fields can't
 * say — and the server validates every one of them anyway.
 *
 * ## Why the preview is trustworthy
 *
 * It renders `BookCover` — the same component the shelf renders, at a smaller
 * size. It is not a drawing of what the shelf will look like; it is the
 * shelf's own book. The only way for the preview to lie is for the shelf to
 * change, which changes the preview in the same commit.
 */

const STYLE_OPTIONS: { value: CoverStyle; label: string }[] = [
  { value: "TITLED", label: "Titled" },
  { value: "PLAIN", label: "Plain" },
  { value: "PHOTO", label: "Photo" },
];

/** How many steps of undo to keep. Plenty for one sitting with a cover. */
const HISTORY = 50;

const ADD_LABELS: Record<ElementType, string> = {
  text: "Text",
  photo: "Photo",
  shape: "Shape",
  sticker: "Sticker",
};

const LIMIT_NOUNS: Record<ElementType, string> = {
  text: "text boxes",
  photo: "photos",
  shape: "shapes",
  sticker: "stickers",
};

/** A small drawing of each shape for the picker. */
const SHAPE_PREVIEWS: Record<ShapeKind, string> = {
  rect: "h-4 w-6 bg-current",
  circle: "size-5 rounded-full bg-current",
  triangle: "size-5 bg-current [clip-path:polygon(50%_0,100%_100%,0_100%)]",
  line: "h-0.5 w-6 bg-current",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="text-caption-1 text-foreground-secondary">{label}</legend>
      <div className="mt-1.5">{children}</div>
    </fieldset>
  );
}

/**
 * A row of radios styled as a segmented control.
 *
 * Native radios, deliberately: a group of them gives arrow-key navigation, a
 * single tab stop and "2 of 3" for free, none of which a row of buttons would
 * have without rebuilding it. The input stays in the DOM and `sr-only`, so the
 * label has to carry the focus ring itself.
 */
function Segmented<T extends string>({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-md bg-background-control p-1">
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <label
            key={option.value}
            className={`cursor-pointer rounded-sm px-2.5 py-1 text-subheadline font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-border-input-strong ${
              selected
                ? "bg-background text-foreground shadow-xs"
                : "text-foreground-secondary hover:text-foreground"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={selected}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}

export default function CoverDesigner({
  title,
  design: initialDesign,
  onUploadingChange,
  previewClassName = "w-full max-w-72",
}: {
  /** The title as currently typed, so the preview shows the real book. */
  title: string;
  /** The saved cover, already resolved — the designer opens on what the shelf shows. */
  design: CoverDesign;
  onUploadingChange?: (uploading: boolean) => void;
  /** The width of the canvas. */
  previewClassName?: string;
}) {
  const [design, setDesign] = useState<CoverDesign>(initialDesign);
  const headingId = useId();
  const hintId = useId();
  const zoomId = useId();
  const photoInputId = useId();
  const boardRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // ---- The placed elements, and their undo history -----------------------
  //
  // `liveRef` mirrors the list synchronously. A drag reports its end in the
  // same tick as its last move, before React has re-rendered, and the commit
  // has to compare against the list as it now is rather than as this render
  // last saw it.
  const [elements, setElements] = useState<CoverElement[]>(initialDesign.coverElements);
  const liveRef = useRef(elements);
  const [past, setPast] = useState<CoverElement[][]>([]);
  const [future, setFuture] = useState<CoverElement[][]>([]);
  const typingRef = useRef<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menu, setMenu] = useState<"shape" | "sticker" | null>(null);
  const [focusText, setFocusText] = useState(0);

  const selected = elements.find((e) => e.id === selectedId) ?? null;

  function setLive(next: CoverElement[]) {
    liveRef.current = next;
    setElements(next);
  }

  function remember(before: CoverElement[]) {
    setPast((p) => [...p, before].slice(-HISTORY));
    setFuture([]);
  }

  /** A gesture on the canvas ended: one step of undo, if it changed anything. */
  function commit(before: CoverElement[]) {
    typingRef.current = null;
    if (before !== liveRef.current) remember(before);
  }

  /**
   * Change the list as one step of undo. `typing` names a run of changes that
   * should collapse into a single step — the letters of one word, the ticks
   * of one slider drag.
   */
  function apply(next: CoverElement[], typing?: string) {
    const before = liveRef.current;
    setLive(next);
    if (!typing || typing !== typingRef.current) remember(before);
    typingRef.current = typing ?? null;
  }

  /** Step to another point in history, letting go of a selection it removes. */
  function travel(to: CoverElement[]) {
    typingRef.current = null;
    setLive(to);
    if (!to.some((e) => e.id === selectedId)) setSelectedId(null);
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

  function select(id: string | null) {
    typingRef.current = null;
    setSelectedId(id);
    if (id) setMenu(null);
  }

  function add(element: CoverElement | null) {
    if (!element) return;
    apply([...liveRef.current, element]);
    select(element.id);
    // A new text box is for typing in, so go straight to its words.
    if (element.type === "text") setFocusText((n) => n + 1);
  }

  function deleteElement(id: string) {
    apply(removeElement(liveRef.current, id));
    select(null);
    // Focus was on the thing that just went; put it somewhere that still
    // exists rather than letting it fall to the top of the page.
    boardRef.current?.focus();
  }

  useEffect(() => {
    if (!focusText) return;
    textRef.current?.focus();
    textRef.current?.select();
  }, [focusText]);

  // ---- Uploads ------------------------------------------------------------
  //
  // Two things can upload — the background photo and a placed one — and the
  // form has to wait for both. Reported only on a change, so the form hears
  // "started" and "finished" once each rather than a stream of repeats.
  const [backgroundUploading, setBackgroundUploading] = useState(false);
  const [elementUploading, setElementUploading] = useState(false);
  const uploading = backgroundUploading || elementUploading;
  const reportedRef = useRef(false);
  useEffect(() => {
    if (reportedRef.current === uploading) return;
    reportedRef.current = uploading;
    onUploadingChange?.(uploading);
  }, [uploading, onUploadingChange]);

  const photoUpload = useImageUpload("cookbook-covers", {
    onUploadingChange: setElementUploading,
    onUploaded: (url) => {
      const element = createPhoto(liveRef.current, url, 1);
      add(element);
      if (!element) return;
      // Sized square until the picture says otherwise, then fitted to its
      // own proportions so nothing is cropped until the owner crops it.
      const probe = new window.Image();
      probe.onload = () => {
        const current = liveRef.current.find((e) => e.id === element.id);
        if (current?.type !== "photo" || current.h !== element.h) return;
        const fitted = createPhoto([], url, probe.naturalHeight / probe.naturalWidth);
        if (fitted) setLive(updateElement(liveRef.current, element.id, { h: fitted.h }));
      };
      probe.src = url;
    },
  });

  // ---- The cloth ----------------------------------------------------------

  function set<K extends keyof CoverDesign>(key: K, value: CoverDesign[K]) {
    setDesign((d) => ({ ...d, [key]: value }));
  }

  const hasImage = Boolean(design.coverImageUrl);
  /**
   * Two different questions, and conflating them was the bug.
   *
   * `isPhotoStyle` is "which panel is open" — the owner has chosen Photo,
   * whether or not they have supplied one yet. `isPhoto` is "is a photograph
   * actually on the board", which is what the preview can be dragged by.
   * Photo used to be un-selectable until an image existed, which meant the one
   * control that looked like it would let you add a photo was greyed out.
   */
  const isPhotoStyle = design.coverStyle === "PHOTO";
  const isPhoto = isPhotoStyle && hasImage;
  const isTitled = design.coverStyle === "TITLED";

  /**
   * Uploading a picture selects Photo. Removing one leaves the style alone.
   *
   * Selecting Photo on upload avoids a trap: someone who uploads an image and
   * saves would otherwise get their old cloth cover back with no explanation.
   *
   * Removing used to step back to Titled, from when Photo could not be chosen
   * without a photograph. Now that it can, bouncing someone off the panel they
   * are working in is just abrupt — they chose Photo, they only cleared the
   * picture. The empty state says what saving now would do.
   *
   * The framing resets with the picture either way, because a focal point
   * chosen for one photograph means nothing on the next.
   */
  function handleImageChange(url: string) {
    setDesign((d) => ({
      ...d,
      coverImageUrl: url || null,
      coverStyle: url ? "PHOTO" : d.coverStyle,
      coverFocalX: 0.5,
      coverFocalY: 0.5,
      coverZoom: MIN_ZOOM,
    }));
  }

  function handleReframe(dx: number, dy: number) {
    setDesign((d) => ({
      ...d,
      coverFocalX: clampFraction(d.coverFocalX + dx),
      coverFocalY: clampFraction(d.coverFocalY + dy),
    }));
  }

  // Undo and redo from the keyboard, anywhere in the designer — except in a
  // text box, where the browser's own undo of the typing is the one wanted.
  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea")) return;
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
  }

  const shown: CoverDesign = { ...design, coverElements: elements };
  const index = selected ? elements.indexOf(selected) : -1;

  return (
    <section aria-labelledby={headingId} onKeyDown={handleKeyDown} className="@container">
      <h3 id={headingId} className="text-subheadline font-medium">
        Cover
      </h3>

      <div className="mt-3 flex flex-col gap-6 @xl:flex-row">
        <div className={`shrink-0 self-center @xl:self-start ${previewClassName}`}>
          <CoverCanvas
            title={title}
            design={shown}
            selectedId={selectedId}
            onSelect={select}
            onLiveChange={setLive}
            onCommit={commit}
            onDelete={deleteElement}
            onEditText={(id) => {
              select(id);
              setFocusText((n) => n + 1);
            }}
            onReframe={handleReframe}
            boardRef={boardRef}
            describedBy={hintId}
          />

          <p id={hintId} className="mt-3 text-caption-1 text-foreground-tertiary">
            {selected
              ? "Drag to move it. Pull a corner to resize, or the dot above to turn it."
              : isPhoto
                ? "Drag the cover to reframe it, or use the arrow keys."
                : "Add text, photos, shapes and stickers, then drag them where you want them."}
          </p>

          {/* What can be added, and undo. */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {(["text", "photo", "shape", "sticker"] as const).map((type) => {
              const full = !canAdd(elements, type);
              const busy = type === "photo" && photoUpload.uploading;
              const label = busy
                ? `Uploading… ${Math.round(photoUpload.percentage)}%`
                : ADD_LABELS[type];
              const className = `inline-flex items-center gap-1 rounded-md border border-border-strong px-2.5 py-1 text-subheadline font-medium ${
                full || busy
                  ? "cursor-not-allowed opacity-50"
                  : "cursor-pointer hover:bg-background-secondary"
              } ${menu === type ? "bg-background-secondary" : ""}`;
              const limit = full
                ? `A cover holds up to ${LIMITS[type]} ${LIMIT_NOUNS[type]}.`
                : undefined;

              if (type === "photo") {
                // A label for a hidden file input, so the picker opens from a
                // real click — browsers refuse to open one from script.
                return (
                  <label
                    key={type}
                    htmlFor={full || busy ? undefined : photoInputId}
                    title={limit}
                    aria-disabled={full || busy}
                    className={`${className} has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-border-input-strong`}
                  >
                    <span aria-hidden>+</span> {label}
                    <input
                      id={photoInputId}
                      type="file"
                      accept={ACCEPTED_IMAGE_TYPES.join(",")}
                      disabled={full || busy}
                      aria-label="Add photo"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void photoUpload.uploadFile(file);
                      }}
                    />
                  </label>
                );
              }

              return (
                <button
                  key={type}
                  type="button"
                  title={limit}
                  disabled={full}
                  aria-expanded={type === "text" ? undefined : menu === type}
                  onClick={() => {
                    if (type === "text") add(createText(liveRef.current, design.coverColor));
                    else setMenu(menu === type ? null : type);
                  }}
                  className={className}
                >
                  <span aria-hidden>+</span> {label}
                </button>
              );
            })}

            <span className="ml-auto inline-flex gap-1">
              <button
                type="button"
                onClick={undo}
                disabled={past.length === 0}
                aria-label="Undo"
                title="Undo"
                className="rounded-md p-1.5 text-foreground-secondary hover:bg-background-secondary disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                  <path d="M9 14 4 9l5-5" />
                  <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
                </svg>
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={future.length === 0}
                aria-label="Redo"
                title="Redo"
                className="rounded-md p-1.5 text-foreground-secondary hover:bg-background-secondary disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                  <path d="m15 14 5-5-5-5" />
                  <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
                </svg>
              </button>
            </span>
          </div>

          {photoUpload.error ? (
            <p role="alert" className="mt-2 text-caption-1 text-error">
              {photoUpload.error}
            </p>
          ) : null}

          {menu === "shape" ? (
            <div role="group" aria-label="Shapes" className="mt-2 flex flex-wrap gap-1.5">
              {SHAPE_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  aria-label={SHAPE_LABELS[kind]}
                  title={SHAPE_LABELS[kind]}
                  onClick={() => add(createShape(liveRef.current, kind, design.coverColor))}
                  className="flex size-10 items-center justify-center rounded-md border border-border text-foreground-secondary hover:bg-background-secondary"
                >
                  <span aria-hidden className={SHAPE_PREVIEWS[kind]} />
                </button>
              ))}
            </div>
          ) : null}

          {menu === "sticker" ? (
            <div role="group" aria-label="Stickers" className="mt-2 grid grid-cols-4 gap-1.5">
              {STICKERS.map((sticker) => (
                <button
                  key={sticker.id}
                  type="button"
                  aria-label={sticker.label}
                  title={sticker.label}
                  onClick={() => add(createSticker(liveRef.current, sticker.id))}
                  className="flex aspect-square items-center justify-center rounded-md border border-border bg-background-control p-1.5 hover:bg-background-secondary"
                >
                  <Sticker name={sticker.id} className="size-full" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          {selected ? (
            <CoverElementInspector
              element={selected}
              textRef={textRef}
              onChange={(patch, typing) =>
                apply(
                  updateElement(liveRef.current, selected.id, patch),
                  typing ? `${selected.id}:${Object.keys(patch).join()}` : undefined,
                )
              }
              onDelete={() => deleteElement(selected.id)}
              onDuplicate={() => {
                const result = duplicateElement(liveRef.current, selected.id);
                if (!result) return;
                apply(result.elements);
                select(result.copy.id);
              }}
              onRestack={(direction) => apply(restack(liveRef.current, selected.id, direction))}
              onDone={() => select(null)}
              canDuplicate={canAdd(elements, selected.type)}
              isTop={index === elements.length - 1}
              isBottom={index === 0}
            />
          ) : null}

          {/* The cloth's controls stay mounted while an element is selected,
              only hidden: they are the form's fields, and a field that
              unmounts stops posting. */}
          <div hidden={Boolean(selected)} className="space-y-4">
            <Field label="Colour">
              <div className="flex flex-wrap gap-2">
                {BOOK_COVERS.map((cover) => {
                  const selectedColour = cover.id === design.coverColor;
                  return (
                    <label
                      key={cover.id}
                      // The ring sits outside the swatch rather than inside it,
                      // so the colour being chosen is never overlaid by the
                      // indicator that it was chosen.
                      className={`relative size-8 cursor-pointer rounded-full ${cover.face} ring-offset-2 ring-offset-background transition-shadow has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-border-input-strong ${
                        selectedColour
                          ? "ring-2 ring-foreground"
                          : "ring-1 ring-border hover:ring-border-strong"
                      }`}
                    >
                      <input
                        type="radio"
                        name="coverColor"
                        value={cover.id}
                        checked={selectedColour}
                        onChange={() => set("coverColor", cover.id)}
                        className="sr-only"
                      />
                      <span className="sr-only">{cover.name}</span>
                    </label>
                  );
                })}
              </div>
            </Field>

            <Field label="Style">
              <Segmented
                name="coverStyle"
                options={STYLE_OPTIONS}
                value={design.coverStyle}
                onChange={(v) => set("coverStyle", v)}
              />
            </Field>

            {/* Everything below belongs to the style chosen above: picking one
                reveals what you can do with it. An earlier version laid all the
                controls out at once and left the upload at the bottom, which put
                the way to add a photo nowhere near the Photo button — and greyed
                that button out until a photo existed, so the one control that
                looked like it would let you add a photo looked disabled. */}

            {/* The weave is printed on cloth, so it has nothing to say about a
                cover that is entirely photograph. */}
            {isPhotoStyle ? (
              <input type="hidden" name="coverTexture" value={design.coverTexture} />
            ) : (
              <Field label="Texture">
                <Segmented
                  name="coverTexture"
                  options={COVER_TEXTURES.map((v) => ({
                    value: v,
                    label: TEXTURES[v].label,
                  }))}
                  value={design.coverTexture}
                  onChange={(v) => set("coverTexture", v)}
                />
              </Field>
            )}

            {isTitled ? (
              <>
                <Field label="Typeface">
                  <Segmented
                    name="coverTitleFont"
                    options={COVER_TITLE_FONTS.map((v) => ({
                      value: v,
                      label: TITLE_FONTS[v].label,
                    }))}
                    value={design.coverTitleFont}
                    onChange={(v) => set("coverTitleFont", v)}
                  />
                </Field>

                <Field label="Title size">
                  <Segmented
                    name="coverTitleSize"
                    options={COVER_TITLE_SIZES.map((v) => ({
                      value: v,
                      label: TITLE_SIZES[v].label,
                    }))}
                    value={design.coverTitleSize}
                    onChange={(v) => set("coverTitleSize", v)}
                  />
                </Field>

                <Field label="Title position">
                  <Segmented
                    name="coverTitlePosition"
                    options={COVER_TITLE_POSITIONS.map((v) => ({
                      value: v,
                      label: TITLE_POSITIONS[v].label,
                    }))}
                    value={design.coverTitlePosition}
                    onChange={(v) => set("coverTitlePosition", v)}
                  />
                </Field>
              </>
            ) : (
              <>
                <input type="hidden" name="coverTitleFont" value={design.coverTitleFont} />
                <input type="hidden" name="coverTitleSize" value={design.coverTitleSize} />
                <input
                  type="hidden"
                  name="coverTitlePosition"
                  value={design.coverTitlePosition}
                />
              </>
            )}

            {/* The photo panel. Choosing an image and framing it live here, under
                the Photo button, rather than in a permanent row at the bottom —
                which is what made the upload hard to find and made "Replace
                image" sit under a cover that wasn't showing a photograph. */}
            {isPhotoStyle ? (
              <Field label="Photo">
                <ImageUploadField
                  folder="cookbook-covers"
                  value={design.coverImageUrl ?? ""}
                  onChange={handleImageChange}
                  onUploadingChange={setBackgroundUploading}
                  // Both suppressed because this section already has a heading
                  // and a much larger preview a few pixels away.
                  heading={null}
                  showPreview={false}
                />

                {hasImage ? (
                  <div className="mt-3">
                    <label
                      htmlFor={zoomId}
                      className="block text-caption-1 text-foreground-secondary"
                    >
                      Zoom
                    </label>
                    <input
                      id={zoomId}
                      type="range"
                      name="coverZoom"
                      min={MIN_ZOOM}
                      max={MAX_ZOOM}
                      step={0.05}
                      value={design.coverZoom}
                      onChange={(e) => set("coverZoom", clampZoom(Number(e.target.value)))}
                      className="mt-1 w-full max-w-56 accent-accent"
                    />
                  </div>
                ) : (
                  // Said plainly, because the preview beside this is showing the
                  // cloth cover and that is not a bug: a Photo cover with no
                  // photograph saves as its cloth (see `createCookbookSchema`),
                  // so the preview is already telling the truth about what a
                  // save would do.
                  <p className="mt-2 text-caption-1 text-foreground-tertiary">
                    Until you add one, this cover saves as the cloth beside it.
                  </p>
                )}
              </Field>
            ) : (
              <input type="hidden" name="coverZoom" value={design.coverZoom} />
            )}

            {/* Everything placed on the cover, top of the stack first — a way
                to reach an element hidden under another, and the keyboard's
                way to select one at all. */}
            {elements.length > 0 ? (
              <Field label="On the cover">
                <ul className="flex flex-col gap-1">
                  {[...elements].reverse().map((element) => (
                    <li key={element.id}>
                      <button
                        type="button"
                        onClick={() => {
                          select(element.id);
                          boardRef.current?.focus();
                        }}
                        className="w-full truncate rounded-md px-2 py-1 text-left text-subheadline hover:bg-background-secondary"
                      >
                        {elementLabel(element)}
                      </button>
                    </li>
                  ))}
                </ul>
              </Field>
            ) : null}
          </div>

          {/* Posted whatever panel is open, so a photograph survives a trip
              through Titled and back without being re-uploaded — and so the
              focal point, which has no control of its own beyond dragging the
              preview, is submitted at all. */}
          <input
            type="hidden"
            name="coverImageUrl"
            value={design.coverImageUrl ?? ""}
          />
          <input type="hidden" name="coverFocalX" value={design.coverFocalX} />
          <input type="hidden" name="coverFocalY" value={design.coverFocalY} />
          <input type="hidden" name="coverElements" value={JSON.stringify(elements)} />
        </div>
      </div>
    </section>
  );
}
