"use client";

import { useId, useRef, useState } from "react";
import BookCover from "@/components/book-cover";
import CoverImageField from "@/components/cover-image-field";
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

/** How far one arrow-key press moves the photograph, as a fraction. */
const NUDGE = 0.02;

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
  previewClassName = "w-32 sm:w-40",
}: {
  /** The title as currently typed, so the preview shows the real book. */
  title: string;
  /** The saved cover, already resolved — the designer opens on what the shelf shows. */
  design: CoverDesign;
  onUploadingChange?: (uploading: boolean) => void;
  /** The wizard gives the preview more room than the settings dialog can. */
  previewClassName?: string;
}) {
  const [design, setDesign] = useState<CoverDesign>(initialDesign);
  const headingId = useId();
  const dragHintId = useId();
  const zoomId = useId();
  const previewRef = useRef<HTMLDivElement>(null);

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

  /**
   * Drag the photograph inside the board.
   *
   * The delta is divided by the preview's own size, so the picture moves by
   * the same *proportion* it appears to move — which is what makes the gesture
   * feel direct at any preview size. The sign is inverted because
   * `objectPosition` names the point of the image pinned to the frame:
   * dragging the picture right reveals more of its left edge.
   *
   * Listeners go on `window` rather than the element so a fast drag that
   * leaves the preview keeps tracking instead of stopping at the edge.
   */
  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!isPhoto) return;
    const box = previewRef.current?.getBoundingClientRect();
    if (!box) return;

    let lastX = event.clientX;
    let lastY = event.clientY;

    const move = (e: PointerEvent) => {
      const dx = (e.clientX - lastX) / box.width;
      const dy = (e.clientY - lastY) / box.height;
      lastX = e.clientX;
      lastY = e.clientY;
      setDesign((d) => ({
        ...d,
        coverFocalX: clampFraction(d.coverFocalX - dx),
        coverFocalY: clampFraction(d.coverFocalY - dy),
      }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // The keyboard equivalent of the drag. A framing control reachable only by
  // mouse would be a control some people simply do not have.
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!isPhoto) return;
    const nudges: Record<string, [number, number]> = {
      ArrowLeft: [-NUDGE, 0],
      ArrowRight: [NUDGE, 0],
      ArrowUp: [0, -NUDGE],
      ArrowDown: [0, NUDGE],
    };
    const nudge = nudges[event.key];
    if (!nudge) return;

    event.preventDefault();
    setDesign((d) => ({
      ...d,
      coverFocalX: clampFraction(d.coverFocalX + nudge[0]),
      coverFocalY: clampFraction(d.coverFocalY + nudge[1]),
    }));
  }

  const across = Math.round(design.coverFocalX * 100);
  const down = Math.round(design.coverFocalY * 100);

  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="text-subheadline font-medium">
        Cover
      </h3>

      <div className="mt-3 flex flex-col gap-5 sm:flex-row sm:gap-6">
        <div className="shrink-0">
          <div
            ref={previewRef}
            // Focusable and draggable only when there is a photograph to
            // frame: on a cloth cover there is nothing to move, and a focus
            // stop that does nothing is worse than no focus stop. The label
            // carries the live percentages so the position is readable without
            // sight of the preview.
            role={isPhoto ? "group" : undefined}
            aria-label={
              isPhoto
                ? `Photo position: ${across}% across, ${down}% down. Use the arrow keys to reframe.`
                : undefined
            }
            aria-describedby={isPhoto ? dragHintId : undefined}
            tabIndex={isPhoto ? 0 : undefined}
            onPointerDown={handlePointerDown}
            onKeyDown={handleKeyDown}
            className={`rounded-md outline-none focus-visible:ring-2 focus-visible:ring-border-input-strong focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              isPhoto ? "cursor-grab touch-none active:cursor-grabbing" : ""
            }`}
          >
            <BookCover
              title={title.trim() || "Untitled cookbook"}
              design={design}
              sizes="160px"
              className={`aspect-3/4 shadow-md ${previewClassName}`}
            />
          </div>

          {isPhoto ? (
            <p
              id={dragHintId}
              className="mt-2 max-w-40 text-caption-1 text-foreground-tertiary"
            >
              Drag the cover to reframe it, or use the arrow keys.
            </p>
          ) : null}
        </div>

        <div className="min-w-0 flex-1 space-y-4">
          <Field label="Colour">
            <div className="flex flex-wrap gap-2">
              {BOOK_COVERS.map((cover) => {
                const selected = cover.id === design.coverColor;
                return (
                  <label
                    key={cover.id}
                    // The ring sits outside the swatch rather than inside it,
                    // so the colour being chosen is never overlaid by the
                    // indicator that it was chosen.
                    className={`relative size-8 cursor-pointer rounded-full ${cover.face} ring-offset-2 ring-offset-background transition-shadow has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-border-input-strong ${
                      selected
                        ? "ring-2 ring-foreground"
                        : "ring-1 ring-border hover:ring-border-strong"
                    }`}
                  >
                    <input
                      type="radio"
                      name="coverColor"
                      value={cover.id}
                      checked={selected}
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
              <CoverImageField
                value={design.coverImageUrl ?? ""}
                onChange={handleImageChange}
                onUploadingChange={onUploadingChange}
                // Both suppressed because this section already has a heading
                // and a much larger preview a few pixels to the left.
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
        </div>
      </div>
    </section>
  );
}
