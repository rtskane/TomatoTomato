"use client";

import { useId, type Ref } from "react";
import { Sticker } from "@/components/cover-stickers";
import type { useImageUpload } from "@/components/image-upload-field";
import {
  BOOK_COVERS,
  COVER_TEXTURES,
  MAX_ZOOM,
  MIN_ZOOM,
  TEXTURES,
  clampZoom,
  type CoverDesign,
  type CoverTexture,
} from "@/lib/book-covers";
import {
  ELEMENT_COLORS,
  ELEMENT_PLURALS,
  LIMITS,
  MAX_TEXT_SIZE,
  MIN_TEXT_SIZE,
  PHOTO_MASKS,
  SHAPE_KINDS,
  SHAPE_LABELS,
  STICKERS,
  TEXT_ALIGNS,
  TEXT_FONTS,
  TEXT_FONT_STYLES,
  canAdd,
  colorCss,
  countOf,
  hasOutline,
  isTitle,
  limitSentence,
  titleElement,
  type CoverElement,
  type ElementColor,
  type ElementType,
  type PhotoMask,
  type ShapeKind,
  type TextAlign,
  type TextElement,
} from "@/lib/cover-elements";
import { createShape, createSticker, createText, createTitle } from "@/lib/cover-editing";
import { ACCEPTED_IMAGE_TYPES } from "@/lib/image-uploads";

// The editor's side panels: one per tool on the rail, and one for whatever is
// selected. Presentational — each takes the cover (or the element) and says
// what was asked for; the editor owns the design and its history.

type Upload = ReturnType<typeof useImageUpload>;

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function PanelTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-headline font-semibold">{children}</h2>;
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id}>
      <span id={id} className="block text-caption-1 font-medium text-foreground-secondary">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/**
 * A row of toggle buttons styled as a segmented control. `aria-pressed`
 * rather than radios: nothing in the editor is a form field — its values
 * leave through the editor's result, not a submit.
 */
function Choices<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-md bg-background-control p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          // Taller on a phone, where it is pressed with a thumb.
          className={`rounded-sm px-2.5 py-1.5 text-subheadline font-medium transition-colors focus-visible:ring-2 focus-visible:ring-border-input-strong focus-visible:outline-none md:py-1 ${
            option.value === value
              ? "bg-background text-foreground shadow-xs"
              : "text-foreground-secondary hover:text-foreground"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function colorName(id: ElementColor): string {
  if (id === "white") return "White";
  return BOOK_COVERS.find((c) => `cover-${c.id}` === id)?.name ?? id;
}

const swatchClass = (selected: boolean) =>
  `size-8 rounded-full ring-offset-2 ring-offset-background transition-shadow focus-visible:ring-2 focus-visible:ring-border-input-strong focus-visible:outline-none ${
    // The strong border even at rest: the palest cloths are almost the
    // panel's own colour, and a faint ring left them looking like gaps.
    selected ? "ring-2 ring-foreground" : "ring-1 ring-border-strong hover:ring-foreground-tertiary"
  }`;

function Swatches({
  value,
  onChange,
}: {
  value: ElementColor;
  onChange: (value: ElementColor) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 md:gap-2.5">
      {ELEMENT_COLORS.map((id) => (
        <button
          key={id}
          type="button"
          aria-pressed={id === value}
          aria-label={colorName(id)}
          title={colorName(id)}
          onClick={() => onChange(id)}
          style={{ backgroundColor: colorCss(id) }}
          className={swatchClass(id === value)}
        />
      ))}
    </div>
  );
}

const tileClass =
  "flex items-center justify-center rounded-lg border border-border bg-background-control text-foreground-secondary transition-colors hover:border-border-strong hover:bg-background-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50";

const buttonClass =
  "rounded-md border border-border-strong px-3 py-1.5 text-subheadline font-medium hover:bg-background-secondary disabled:opacity-50 disabled:hover:bg-transparent";

/** "2 of 6 shapes", and why the buttons have stopped working once it is full. */
function LimitNote({ elements, type }: { elements: readonly CoverElement[]; type: ElementType }) {
  const full = !canAdd(elements, type);
  return (
    <p className={`text-caption-1 ${full ? "text-foreground-secondary" : "text-foreground-tertiary"}`}>
      {full
        ? `${limitSentence(type)} Remove one to add another.`
        : `${countOf(elements, type)} of ${LIMITS[type]} ${ELEMENT_PLURALS[type]} used.`}
    </p>
  );
}

/** A button that opens the file chooser and reports the upload's progress. */
function UploadButton({
  upload,
  label,
  disabled = false,
}: {
  upload: Upload;
  label: string;
  disabled?: boolean;
}) {
  const id = useId();
  const off = disabled || upload.uploading;
  return (
    <>
      <label
        htmlFor={off ? undefined : id}
        aria-disabled={off}
        className={`inline-flex ${buttonClass} has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-border-input-strong ${
          off ? "cursor-not-allowed opacity-50" : "cursor-pointer"
        }`}
      >
        {upload.uploading ? `Uploading… ${Math.round(upload.percentage)}%` : label}
        <input
          id={id}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
          disabled={off}
          aria-label={label}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Cleared so choosing the same file again still fires a change.
            e.target.value = "";
            if (file) void upload.uploadFile(file);
          }}
        />
      </label>
      {upload.error ? (
        <p role="alert" className="mt-2 text-caption-1 text-error">
          {upload.error}
        </p>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

export function BackgroundPanel({
  design,
  onColor,
  onTexture,
  onZoom,
  onRemovePhoto,
}: {
  design: CoverDesign;
  onColor: (color: number) => void;
  onTexture: (texture: CoverTexture) => void;
  onZoom: (zoom: number) => void;
  onRemovePhoto: () => void;
}) {
  const zoomId = useId();
  const hasPhoto = Boolean(design.coverImageUrl);

  return (
    <div className="space-y-5">
      <PanelTitle>Background</PanelTitle>

      <Group label="Colour">
        <div className="flex flex-wrap gap-2 md:gap-2.5">
          {BOOK_COVERS.map((cover) => (
            <button
              key={cover.id}
              type="button"
              aria-pressed={cover.id === design.coverColor}
              aria-label={cover.name}
              title={cover.name}
              onClick={() => onColor(cover.id)}
              className={`${cover.face} ${swatchClass(cover.id === design.coverColor)}`}
            />
          ))}
        </div>
      </Group>

      {/* The weave is printed on cloth, so it has nothing to say about a
          cover that is entirely photograph. */}
      {hasPhoto ? null : (
        <Group label="Pattern">
          <Choices
            options={COVER_TEXTURES.map((v) => ({ value: v, label: TEXTURES[v].label }))}
            value={design.coverTexture}
            onChange={onTexture}
          />
        </Group>
      )}

      {/* Only for a cover that already has one. Filling the board with a
          photo is no longer offered — a photo goes on the cover as something
          placed, from the Photo tool — but a cover made that way before still
          has to be adjustable, and able to go back to cloth. */}
      {hasPhoto ? (
        <Group label="Background photo">
          <div className="space-y-3">
            <div>
              <label htmlFor={zoomId} className="block text-caption-1 text-foreground-secondary">
                Zoom
              </label>
              <input
                id={zoomId}
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.05}
                value={design.coverZoom}
                onChange={(e) => onZoom(clampZoom(Number(e.target.value)))}
                className="mt-1 w-full accent-accent"
              />
            </div>
            <button type="button" onClick={onRemovePhoto} className={buttonClass}>
              Remove photo
            </button>
            <p className="text-caption-1 text-foreground-tertiary">
              Drag the cover to choose which part of the photo shows.
            </p>
          </div>
        </Group>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/** The three kinds of text box on offer, each a starting point, not a type. */
const TEXT_PRESETS: {
  label: string;
  sample: string;
  className: string;
  patch: Partial<TextElement>;
}[] = [
  {
    label: "Add a heading",
    sample: "Heading",
    className: "font-serif text-title-3",
    patch: { text: "Heading", font: "SERIF", size: 10, bold: true },
  },
  {
    label: "Add a subheading",
    sample: "Subheading",
    className: "font-sans text-body",
    patch: { text: "Subheading", font: "SANS", size: 6 },
  },
  {
    label: "Add a small note",
    sample: "A small note",
    className: "font-mono text-caption-1",
    patch: { text: "A small note", font: "MONO", size: 4.2 },
  },
];

export function TextPanel({
  elements,
  coverColor,
  onAdd,
}: {
  elements: readonly CoverElement[];
  coverColor: number;
  onAdd: (element: CoverElement | null) => void;
}) {
  const full = !canAdd(elements, "text");

  return (
    <div className="space-y-4">
      <PanelTitle>Text</PanelTitle>

      {/* Only when it isn't there: the name appears on a cover once. */}
      {titleElement(elements) ? null : (
        <button
          type="button"
          disabled={full}
          onClick={() => onAdd(createTitle(elements, coverColor))}
          className={`${tileClass} w-full flex-col gap-0.5 px-3 py-3`}
        >
          <span className="text-subheadline font-medium text-foreground">
            Add the cookbook&rsquo;s name
          </span>
          <span className="text-caption-1 text-foreground-tertiary">
            Follows the name if you change it
          </span>
        </button>
      )}

      <div className="space-y-2">
        {TEXT_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            disabled={full}
            aria-label={preset.label}
            onClick={() => {
              const text = createText(elements, coverColor);
              onAdd(text ? { ...text, ...preset.patch } : null);
            }}
            className={`${tileClass} w-full px-3 py-3 ${preset.className} text-foreground`}
          >
            {preset.sample}
          </button>
        ))}
      </div>

      <LimitNote elements={elements} type="text" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Photo
// ---------------------------------------------------------------------------

export function PhotoPanel({
  elements,
  upload,
}: {
  elements: readonly CoverElement[];
  upload: Upload;
}) {
  return (
    <div className="space-y-4">
      <PanelTitle>Photo</PanelTitle>
      <p className="text-subheadline text-foreground-secondary">
        Place a photo on the cover, then move, resize and crop it to a shape.
      </p>
      <div>
        <UploadButton upload={upload} label="Upload a photo" disabled={!canAdd(elements, "photo")} />
      </div>
      <LimitNote elements={elements} type="photo" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shapes and stickers
// ---------------------------------------------------------------------------

/** A small drawing of each shape for the picker. */
const SHAPE_PREVIEWS: Record<ShapeKind, string> = {
  rect: "h-6 w-9 bg-current",
  circle: "size-8 rounded-full bg-current",
  triangle: "size-8 bg-current [clip-path:polygon(50%_0,100%_100%,0_100%)]",
  line: "h-0.5 w-9 bg-current",
  frame: "h-9 w-7 rounded-xs border border-current",
};

export function ShapePanel({
  elements,
  coverColor,
  onAdd,
}: {
  elements: readonly CoverElement[];
  coverColor: number;
  onAdd: (element: CoverElement | null) => void;
}) {
  const full = !canAdd(elements, "shape");
  return (
    <div className="space-y-4">
      <PanelTitle>Shapes</PanelTitle>
      {/* One row on a phone, where the panel is short and wide. */}
      <div className="grid grid-cols-5 gap-2 md:grid-cols-3">
        {SHAPE_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            disabled={full}
            aria-label={SHAPE_LABELS[kind]}
            title={SHAPE_LABELS[kind]}
            onClick={() => onAdd(createShape(elements, kind, coverColor))}
            className={`${tileClass} aspect-square flex-col gap-1.5`}
          >
            <span aria-hidden className="flex h-9 items-center">
              <span className={SHAPE_PREVIEWS[kind]} />
            </span>
            <span aria-hidden className="text-caption-1">
              {SHAPE_LABELS[kind]}
            </span>
          </button>
        ))}
      </div>
      <LimitNote elements={elements} type="shape" />
    </div>
  );
}

export function StickerPanel({
  elements,
  onAdd,
}: {
  elements: readonly CoverElement[];
  onAdd: (element: CoverElement | null) => void;
}) {
  const full = !canAdd(elements, "sticker");
  return (
    <div className="space-y-4">
      <PanelTitle>Stickers</PanelTitle>
      <div className="grid grid-cols-4 gap-2 md:grid-cols-3">
        {STICKERS.map((sticker) => (
          <button
            key={sticker.id}
            type="button"
            disabled={full}
            aria-label={sticker.label}
            title={sticker.label}
            onClick={() => onAdd(createSticker(elements, sticker.id))}
            className={`${tileClass} aspect-square p-2.5`}
          >
            <Sticker name={sticker.id} className="size-full" />
          </button>
        ))}
      </div>
      <LimitNote elements={elements} type="sticker" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The selected element
// ---------------------------------------------------------------------------

const MASK_LABELS: Record<PhotoMask, string> = {
  rect: "Square",
  rounded: "Rounded",
  circle: "Round",
};

const ALIGN_LABELS: Record<TextAlign, string> = {
  left: "Left",
  center: "Centre",
  right: "Right",
};

/** What to call an element where it has to be named. */
export function elementLabel(element: CoverElement): string {
  switch (element.type) {
    case "text":
      if (isTitle(element)) return "Cookbook name";
      return element.text.trim() ? `“${element.text.trim().slice(0, 24)}”` : "Text";
    case "photo":
      return "Photo";
    case "shape":
      return SHAPE_LABELS[element.shape];
    case "sticker":
      return STICKERS.find((s) => s.id === element.sticker)?.label ?? "Sticker";
  }
}

export function ElementPanel({
  element,
  title,
  onTitleChange,
  onChange,
  onDelete,
  onDuplicate,
  onRestack,
  onDone,
  canDuplicate,
  isTop,
  isBottom,
  textRef,
}: {
  element: CoverElement;
  /** The cookbook's name — what the title element's field edits. */
  title: string;
  onTitleChange: (title: string) => void;
  /**
   * `typing` marks a change that is one of a run — letters, slider ticks —
   * so the editor can fold the run into a single step of undo.
   */
  onChange: (patch: Partial<CoverElement>, typing?: boolean) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRestack: (direction: "forward" | "backward") => void;
  onDone: () => void;
  canDuplicate: boolean;
  isTop: boolean;
  isBottom: boolean;
  /** The words' field, so a double-click on the canvas can focus it. */
  textRef?: Ref<HTMLTextAreaElement | HTMLInputElement>;
}) {
  const textId = useId();
  const sizeId = useId();
  const linked = isTitle(element);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <PanelTitle>{elementLabel(element)}</PanelTitle>
        <button
          type="button"
          onClick={onDone}
          className="rounded-md px-2 py-1 text-subheadline font-medium text-foreground-secondary hover:bg-background-secondary hover:text-foreground"
        >
          Deselect
        </button>
      </div>

      {element.type === "text" ? (
        <>
          <div>
            <label htmlFor={textId} className="block text-caption-1 font-medium text-foreground-secondary">
              {linked ? "Name" : "Text"}
            </label>
            {linked ? (
              <>
                <input
                  id={textId}
                  ref={textRef as Ref<HTMLInputElement>}
                  value={title}
                  maxLength={80}
                  placeholder="Name your cookbook"
                  onChange={(e) => onTitleChange(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-border bg-background-control px-3 py-2 text-body outline-none focus:border-border-input-strong focus:bg-transparent"
                />
                <p className="mt-1.5 text-caption-1 text-foreground-tertiary">
                  This is the cookbook&rsquo;s name. Changing it here renames the
                  cookbook.
                </p>
              </>
            ) : (
              <textarea
                id={textId}
                ref={textRef as Ref<HTMLTextAreaElement>}
                rows={2}
                maxLength={120}
                value={element.text}
                onChange={(e) => onChange({ text: e.target.value }, true)}
                className="mt-1.5 block w-full resize-none rounded-lg border border-border bg-background-control px-3 py-2 text-body outline-none focus:border-border-input-strong focus:bg-transparent"
              />
            )}
          </div>

          <Group label="Font">
            <Choices
              options={TEXT_FONTS.map((f) => ({ value: f, label: TEXT_FONT_STYLES[f].label }))}
              value={element.font}
              onChange={(font) => onChange({ font })}
            />
          </Group>

          <div>
            <label htmlFor={sizeId} className="block text-caption-1 font-medium text-foreground-secondary">
              Size
            </label>
            <input
              id={sizeId}
              type="range"
              min={MIN_TEXT_SIZE}
              max={MAX_TEXT_SIZE}
              step={0.5}
              value={element.size}
              onChange={(e) => onChange({ size: Number(e.target.value) }, true)}
              className="mt-1 w-full accent-accent"
            />
          </div>

          <Group label="Style">
            <div className="flex flex-wrap gap-2">
              <Choices
                options={TEXT_ALIGNS.map((a) => ({ value: a, label: ALIGN_LABELS[a] }))}
                value={element.align}
                onChange={(align) => onChange({ align })}
              />
              <div className="inline-flex gap-1 rounded-md bg-background-control p-1">
                {(
                  [
                    { key: "bold", label: "Bold", glyph: "B", className: "font-bold" },
                    { key: "italic", label: "Italic", glyph: "I", className: "font-serif italic" },
                  ] as const
                ).map((toggle) => (
                  <button
                    key={toggle.key}
                    type="button"
                    aria-pressed={element[toggle.key]}
                    aria-label={toggle.label}
                    title={toggle.label}
                    onClick={() => onChange({ [toggle.key]: !element[toggle.key] })}
                    className={`min-w-8 rounded-sm px-2.5 py-1.5 text-subheadline md:py-1 ${toggle.className} focus-visible:ring-2 focus-visible:ring-border-input-strong focus-visible:outline-none ${
                      element[toggle.key]
                        ? "bg-background text-foreground shadow-xs"
                        : "text-foreground-secondary hover:text-foreground"
                    }`}
                  >
                    {toggle.glyph}
                  </button>
                ))}
              </div>
            </div>
          </Group>

          <Group label="Colour">
            <Swatches value={element.color} onChange={(color) => onChange({ color })} />
          </Group>
        </>
      ) : null}

      {element.type === "photo" ? (
        <Group label="Crop to">
          <Choices
            options={PHOTO_MASKS.map((m) => ({ value: m, label: MASK_LABELS[m] }))}
            value={element.mask}
            onChange={(mask) => onChange({ mask })}
          />
        </Group>
      ) : null}

      {element.type === "shape" ? (
        <>
          <Group label="Colour">
            <Swatches value={element.color} onChange={(color) => onChange({ color })} />
          </Group>
          {hasOutline(element.shape) ? (
            <Group label="Fill">
              <Choices
                options={[
                  { value: "fill", label: "Filled" },
                  { value: "outline", label: "Outline" },
                ]}
                value={element.outline ? "outline" : "fill"}
                onChange={(v) => onChange({ outline: v === "outline" })}
              />
            </Group>
          ) : null}
        </>
      ) : null}

      <Group label="Arrange">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onRestack("forward")}
            disabled={isTop}
            className={buttonClass}
          >
            Forward
          </button>
          <button
            type="button"
            onClick={() => onRestack("backward")}
            disabled={isBottom}
            className={buttonClass}
          >
            Backward
          </button>
        </div>
      </Group>

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        {/* There is one name, so there is no copy of it to make. */}
        {linked ? null : (
          <button
            type="button"
            onClick={onDuplicate}
            disabled={!canDuplicate}
            title={canDuplicate ? undefined : limitSentence(element.type)}
            className={buttonClass}
          >
            Duplicate
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md border border-border-strong px-3 py-1.5 text-subheadline font-medium text-error hover:bg-background-secondary"
        >
          {linked ? "Remove from cover" : "Delete"}
        </button>
      </div>
    </div>
  );
}
