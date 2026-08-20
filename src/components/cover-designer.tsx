"use client";

import { useId, useState } from "react";
import BookCover from "@/components/book-cover";
import CoverImageField from "@/components/cover-image-field";
import { BOOK_COVERS, type CoverStyle } from "@/lib/book-covers";

/**
 * Design a cookbook's cover: pick the cloth colour, pick how it presents
 * itself, and see the actual book while you do it.
 *
 * ## Why this owns its state
 *
 * The three values it produces are submitted as ordinary form fields, but they
 * are held in React state rather than read off the DOM, for the same reason the
 * cover URL always was: an upload lands long after render, and a rejected
 * submit re-renders the form. State on a component that isn't remounted
 * survives both; a `defaultValue` on an input does not.
 *
 * The radios *are* the fields — `name="coverColor"` and `name="coverStyle"`
 * post themselves. There is no parallel set of hidden inputs mirroring the
 * radios, because two representations of one choice is exactly how they end up
 * disagreeing. Only the cover URL needs a hidden input, having no visible
 * control of its own.
 *
 * ## Why the preview is trustworthy
 *
 * It renders `BookCover` — the same component the shelf renders, at a smaller
 * size. It is not a drawing of what the shelf will look like; it is the shelf's
 * own book. The only way for the preview to lie is for the shelf to change,
 * which changes the preview in the same commit.
 */

const STYLE_OPTIONS: { value: CoverStyle; label: string; hint: string }[] = [
  { value: "TITLED", label: "Titled", hint: "The title, printed on the cloth." },
  { value: "PLAIN", label: "Plain", hint: "Just the cloth." },
  { value: "PHOTO", label: "Photo", hint: "Your picture, filling the cover." },
];

export default function CoverDesigner({
  title,
  defaultCoverColor,
  defaultCoverStyle,
  defaultCoverImageUrl = "",
  onUploadingChange,
}: {
  /** The title as currently typed, so the preview shows the real book. */
  title: string;
  /** Already resolved, so the designer opens on the colour the shelf shows. */
  defaultCoverColor: number;
  defaultCoverStyle: CoverStyle;
  defaultCoverImageUrl?: string;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const [coverColor, setCoverColor] = useState(defaultCoverColor);
  const [coverStyle, setCoverStyle] = useState<CoverStyle>(defaultCoverStyle);
  const [coverImageUrl, setCoverImageUrl] = useState(defaultCoverImageUrl);
  const headingId = useId();

  const hasImage = Boolean(coverImageUrl);

  /**
   * Uploading a picture selects Photo, and removing it steps back off Photo.
   *
   * Anything else is a trap: someone who uploads an image and saves would get
   * their old colour cover and no explanation, and someone who removes the
   * image while Photo is selected would be left on a style that cannot draw.
   * The style follows the picture because that is what choosing the picture
   * plainly meant.
   */
  function handleImageChange(url: string) {
    setCoverImageUrl(url);
    if (url) setCoverStyle("PHOTO");
    else if (coverStyle === "PHOTO") setCoverStyle("TITLED");
  }

  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="text-subheadline font-medium">
        Cover
      </h3>

      <div className="mt-3 flex flex-col gap-5 sm:flex-row sm:gap-6">
        {/* aria-hidden: everything it shows is already announced by the title
            field and the checked radios, so reading it out loud would repeat
            the title a third time rather than add anything. */}
        <div aria-hidden className="shrink-0">
          <BookCover
            title={title.trim() || "Untitled cookbook"}
            coverColor={coverColor}
            coverStyle={coverStyle}
            coverImageUrl={coverImageUrl || null}
            sizes="128px"
            className="aspect-3/4 w-32 shadow-md"
          />
        </div>

        <div className="min-w-0 flex-1 space-y-5">
          {/* Native radios, deliberately: a group of them gives arrow-key
              navigation, a single tab stop and "3 of 8" for free, none of
              which a grid of buttons would have without rebuilding it. */}
          <fieldset>
            <legend className="text-caption-1 text-foreground-secondary">
              Colour
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {BOOK_COVERS.map((cover) => {
                const selected = cover.id === coverColor;
                return (
                  <label
                    key={cover.id}
                    // The ring sits outside the swatch rather than inside it,
                    // so the colour being chosen is never overlaid by the
                    // indicator that it was chosen.
                    // The radio inside is sr-only, so the label has to carry
                    // the focus ring itself — without `has-[:focus-visible]`
                    // a keyboard user arrowing through the colours would have
                    // no idea which one they were on.
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
                      onChange={() => setCoverColor(cover.id)}
                      className="sr-only"
                    />
                    <span className="sr-only">{cover.name}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-caption-1 text-foreground-secondary">
              Style
            </legend>
            <div className="mt-2 inline-flex gap-1 rounded-md bg-background-control p-1">
              {STYLE_OPTIONS.map((option) => {
                const selected = option.value === coverStyle;
                // Photo is offered only once there is a photo. Selectable-but-
                // broken would be the alternative, and a control that accepts a
                // choice it can't honour is worse than one that waits.
                const disabled = option.value === "PHOTO" && !hasImage;

                return (
                  <label
                    key={option.value}
                    title={option.hint}
                    className={`cursor-pointer rounded-sm px-3 py-1 text-subheadline font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-border-input-strong ${
                      selected
                        ? "bg-background text-foreground shadow-xs"
                        : "text-foreground-secondary hover:text-foreground"
                    } ${disabled ? "cursor-not-allowed opacity-40 hover:text-foreground-secondary" : ""}`}
                  >
                    <input
                      type="radio"
                      name="coverStyle"
                      value={option.value}
                      checked={selected}
                      disabled={disabled}
                      onChange={() => setCoverStyle(option.value)}
                      className="sr-only"
                    />
                    {option.label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div>
            <CoverImageField
              value={coverImageUrl}
              onChange={handleImageChange}
              onUploadingChange={onUploadingChange}
              // Both suppressed because this section already has a heading and
              // a much larger preview a few pixels to the left.
              heading={null}
              showPreview={false}
            />
            <input type="hidden" name="coverImageUrl" value={coverImageUrl} />
          </div>
        </div>
      </div>
    </section>
  );
}
