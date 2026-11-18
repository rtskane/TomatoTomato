"use client";

import { useId, type Ref } from "react";
import { BOOK_COVERS } from "@/lib/book-covers";
import {
  ELEMENT_COLORS,
  MAX_TEXT_SIZE,
  MIN_TEXT_SIZE,
  PHOTO_MASKS,
  SHAPE_LABELS,
  STICKERS,
  TEXT_ALIGNS,
  TEXT_FONTS,
  TEXT_FONT_STYLES,
  colorCss,
  hasOutline,
  type CoverElement,
  type ElementColor,
  type PhotoMask,
  type TextAlign,
} from "@/lib/cover-elements";

/**
 * The controls for whichever element is selected on the cover.
 *
 * None of these are form fields. The element list is posted whole, as JSON,
 * by the designer — so the controls here are plain buttons that say whether
 * they are on (`aria-pressed`) rather than radios with a `name`, which would
 * post themselves alongside it as stray fields.
 */

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

function colorName(id: ElementColor): string {
  if (id === "white") return "White";
  return BOOK_COVERS.find((c) => `cover-${c.id}` === id)?.name ?? id;
}

export function elementLabel(element: CoverElement): string {
  switch (element.type) {
    case "text":
      return element.text.trim() ? `“${element.text.trim().slice(0, 24)}”` : "Text";
    case "photo":
      return "Photo";
    case "shape":
      return SHAPE_LABELS[element.shape];
    case "sticker":
      return STICKERS.find((s) => s.id === element.sticker)?.label ?? "Sticker";
  }
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id}>
      <span id={id} className="block text-caption-1 text-foreground-secondary">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/** A row of toggle buttons, styled like the designer's segmented radios. */
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
          className={`rounded-sm px-2.5 py-1 text-subheadline font-medium transition-colors focus-visible:ring-2 focus-visible:ring-border-input-strong focus-visible:outline-none ${
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

function Swatches({
  value,
  onChange,
}: {
  value: ElementColor;
  onChange: (value: ElementColor) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {ELEMENT_COLORS.map((id) => (
        <button
          key={id}
          type="button"
          aria-pressed={id === value}
          aria-label={colorName(id)}
          onClick={() => onChange(id)}
          style={{ backgroundColor: colorCss(id) }}
          className={`size-7 rounded-full ring-offset-2 ring-offset-background transition-shadow focus-visible:ring-2 focus-visible:ring-border-input-strong focus-visible:outline-none ${
            id === value ? "ring-2 ring-foreground" : "ring-1 ring-border hover:ring-border-strong"
          }`}
        />
      ))}
    </div>
  );
}

const actionClass =
  "rounded-md border border-border-strong px-2.5 py-1 text-subheadline font-medium hover:bg-background-secondary disabled:opacity-50 disabled:hover:bg-transparent";

export default function CoverElementInspector({
  element,
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
  /**
   * `typing` marks a change that should fold into the one before it for
   * undo — one step per word typed would make undo useless.
   */
  onChange: (patch: Partial<CoverElement>, typing?: boolean) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRestack: (direction: "forward" | "backward") => void;
  onDone: () => void;
  canDuplicate: boolean;
  isTop: boolean;
  isBottom: boolean;
  textRef?: Ref<HTMLTextAreaElement>;
}) {
  const textId = useId();
  const sizeId = useId();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-subheadline font-medium">{elementLabel(element)}</h4>
        <button
          type="button"
          onClick={onDone}
          className="rounded-md bg-background-secondary px-3 py-1 text-subheadline font-medium hover:bg-background-tertiary"
        >
          Done
        </button>
      </div>

      {element.type === "text" ? (
        <>
          <div>
            <label htmlFor={textId} className="block text-caption-1 text-foreground-secondary">
              Text
            </label>
            <textarea
              id={textId}
              ref={textRef}
              rows={2}
              maxLength={120}
              value={element.text}
              onChange={(e) => onChange({ text: e.target.value }, true)}
              // 16px type, not the form's usual 15: anything smaller and iOS
              // zooms the whole page in when the box is focused.
              className="mt-1.5 block w-full resize-none rounded-lg border border-border bg-background-control px-3 py-2 text-body outline-none focus:border-border-input-strong focus:bg-transparent"
            />
          </div>

          <Group label="Font">
            <Choices
              options={TEXT_FONTS.map((f) => ({ value: f, label: TEXT_FONT_STYLES[f].label }))}
              value={element.font}
              onChange={(font) => onChange({ font })}
            />
          </Group>

          <div>
            <label htmlFor={sizeId} className="block text-caption-1 text-foreground-secondary">
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
              className="mt-1 w-full max-w-56 accent-accent"
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
                    { key: "bold", label: "Bold", className: "font-bold" },
                    { key: "italic", label: "Italic", className: "italic" },
                  ] as const
                ).map((toggle) => (
                  <button
                    key={toggle.key}
                    type="button"
                    aria-pressed={element[toggle.key]}
                    onClick={() => onChange({ [toggle.key]: !element[toggle.key] })}
                    className={`rounded-sm px-2.5 py-1 text-subheadline ${toggle.className} focus-visible:ring-2 focus-visible:ring-border-input-strong focus-visible:outline-none ${
                      element[toggle.key]
                        ? "bg-background text-foreground shadow-xs"
                        : "text-foreground-secondary hover:text-foreground"
                    }`}
                  >
                    {toggle.label}
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
        <Group label="Shape">
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
                  { value: "solid", label: "Solid" },
                  { value: "outline", label: "Outline" },
                ]}
                value={element.outline ? "outline" : "solid"}
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
            className={actionClass}
          >
            Bring forward
          </button>
          <button
            type="button"
            onClick={() => onRestack("backward")}
            disabled={isBottom}
            className={actionClass}
          >
            Send back
          </button>
          {element.rotation !== 0 ? (
            <button type="button" onClick={() => onChange({ rotation: 0 })} className={actionClass}>
              Straighten
            </button>
          ) : null}
        </div>
      </Group>

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={onDuplicate}
          disabled={!canDuplicate}
          className={actionClass}
        >
          Duplicate
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md px-2.5 py-1 text-subheadline font-medium text-error hover:bg-background-secondary"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
