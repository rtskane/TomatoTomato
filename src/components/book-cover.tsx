import Image from "next/image";
import {
  paletteFor,
  clampFraction,
  clampZoom,
  TEXTURES,
  TITLE_FONTS,
  TITLE_SIZES,
  TITLE_POSITIONS,
  DEFAULT_COVER_DESIGN,
  type CoverDesign,
} from "@/lib/book-covers";

/**
 * A cookbook drawn as a physical book: cloth boards, a spine down the left,
 * page edges on the right.
 *
 * This is the *only* place a book face is drawn. The shelf, the list's
 * thumbnail chip, the cookbook page and the cover designer's preview all
 * render this component, which is what makes the designer honest — the preview
 * isn't a mock-up of the shelf, it is the shelf's own component at a smaller
 * size, so the two cannot drift apart as either changes.
 *
 * No "use client": it holds no state and no handlers, so the server components
 * that list cookbooks render it on the server, and the client-side designer
 * renders the same thing in the browser.
 */

/**
 * The two sizes a book is drawn at, and everything that genuinely differs
 * between them.
 *
 * Only the *rendered detail* lives here — a chip is too small for a title, and
 * a spine scaled down to a hairline stops reading as a spine. The box's own
 * dimensions do not: those come from the caller's `className`, because the
 * shelf wants a fluid `w-full max-w-60` and the designer a fixed width, and
 * baking either into the component would make the other impossible.
 *
 * ## Why `book` is measured in cqw and not pixels
 *
 * A book is drawn at 240px on the shelf and 128px in the designer's preview,
 * and it has to be the *same object* at both — that is the whole claim the
 * preview makes. Fixed pixels break that claim in one specific way: type sized
 * for the shelf overflows the frame at preview size and gets clipped by the
 * `overflow-hidden` on the board, so the preview shows a title the shelf
 * doesn't ("Weekn Dinner"). Sizing the inner detail in `cqw` — percentages of
 * the board's own width — makes the book scale as a whole, the way a
 * photograph of one would.
 */
const SIZES = {
  book: {
    spine: "w-[5cqw]",
    hairlineOffset: "left-[5cqw]",
    foreEdge: "w-[1.25cqw]",
    frame:
      "absolute inset-y-[6.7cqw] right-[6.7cqw] left-[11.7cqw] flex justify-center rounded-xs border px-[3cqw] py-[4cqw] text-center",
    radius: "rounded-r-md rounded-l-xs",
    showTitle: true,
    /** The weave sits lighter on a big board and would disappear on a chip. */
    weaveOpacity: "opacity-[0.09]",
  },
  chip: {
    // Not proportional: at 36px wide a 5%-of-width spine is under two pixels
    // and stops reading as a spine at all, so the chip keeps flat sizes.
    spine: "w-1",
    hairlineOffset: "left-1",
    foreEdge: "w-[2px]",
    frame: null,
    radius: "rounded-xs rounded-l-[1px]",
    // A chip never shows a title — at 36px wide there is no type size that is
    // both legible and in proportion, and the title is already sitting next to
    // it in the row. This is the deliberate degradation rule for small sizes:
    // colour, weave and photograph survive, type does not.
    showTitle: false,
    weaveOpacity: "opacity-[0.14]",
  },
} as const;

export type BookCoverSize = keyof typeof SIZES;

export default function BookCover({
  title,
  design,
  size = "book",
  sizes,
  className = "",
}: {
  title: string;
  /** The composed cover. `coverColor` is already resolved to 1..COVER_COUNT. */
  design: CoverDesign;
  size?: BookCoverSize;
  /** Passed to next/image; the caller knows how wide this renders. */
  sizes?: string;
  /** The box: aspect ratio, width, and any hover treatment. */
  className?: string;
}) {
  const palette = paletteFor(design.coverColor);
  const spec = SIZES[size];

  // PHOTO without a picture can't be drawn. The schema folds that combination
  // away on write, so reaching it here means older data or a direct database
  // edit — either way the cloth is a better answer than an empty board.
  const showPhoto = design.coverStyle === "PHOTO" && Boolean(design.coverImageUrl);
  const showTitle =
    !showPhoto && design.coverStyle !== "PLAIN" && spec.frame !== null && spec.showTitle;

  const weave = TEXTURES[design.coverTexture]?.className ?? null;

  return (
    <div
      // `isolate` keeps the -z-10 photo below the spine and fore-edge without
      // escaping behind the page itself. `@container` is what makes every cqw
      // size above — and the weave patterns — resolve against this board
      // rather than the viewport.
      className={`@container relative isolate overflow-hidden ${spec.radius} ${palette.face} ${className}`}
    >
      {/* Spine: the ink at low alpha, so a dark cover gets an edge catching the
          light and a pale one an edge falling into shadow. */}
      <span className={`absolute inset-y-0 left-0 ${spec.spine} ${palette.shade}`} />
      <span
        className={`absolute inset-y-0 ${spec.hairlineOffset} w-px ${palette.hairline}`}
      />

      {/* Fore-edge: the pages, inset top and bottom so the boards overhang. */}
      <span
        className={`absolute inset-y-[3%] right-0 ${spec.foreEdge} rounded-r-xs bg-background`}
      />

      {showPhoto ? (
        // -z-10 puts the photo under the spine and fore-edge drawn above,
        // rather than over them. `alt=""` because every caller names the
        // cookbook in text beside or beneath this.
        //
        // The focal point is applied as `objectPosition` and the zoom as a
        // scale about that same point, so zooming pushes into whatever the
        // owner centred rather than into the middle of the frame.
        <Image
          src={design.coverImageUrl as string}
          alt=""
          fill
          sizes={sizes}
          className="-z-10 object-cover"
          style={{
            objectPosition: `${clampFraction(design.coverFocalX) * 100}% ${
              clampFraction(design.coverFocalY) * 100
            }%`,
            transform: `scale(${clampZoom(design.coverZoom)})`,
            transformOrigin: `${clampFraction(design.coverFocalX) * 100}% ${
              clampFraction(design.coverFocalY) * 100
            }%`,
          }}
        />
      ) : (
        <>
          {/* A flat fill reads as a swatch; a fill with a corner lit reads as
              cloth. Decorative, and never above the title. */}
          <span
            className={`pointer-events-none absolute inset-0 -z-10 ${palette.sheen}`}
          />
          {weave ? (
            // `palette.ink` is here to set `currentColor`, which is what the
            // weave pattern is drawn in — not to render any text.
            <span
              aria-hidden
              className={`pointer-events-none absolute inset-0 -z-10 ${weave} ${palette.ink} ${spec.weaveOpacity}`}
            />
          ) : null}
        </>
      )}

      {showTitle ? (
        <div
          className={`${spec.frame} ${palette.frame} ${
            TITLE_POSITIONS[design.coverTitlePosition]?.className ??
            TITLE_POSITIONS.CENTER.className
          }`}
        >
          <p
            className={`line-clamp-4 leading-[1.2] text-balance ${
              TITLE_FONTS[design.coverTitleFont]?.className ?? TITLE_FONTS.SERIF.className
            } ${
              TITLE_SIZES[design.coverTitleSize]?.className ?? TITLE_SIZES.MEDIUM.className
            } ${palette.ink}`}
          >
            {title}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Build a `CoverDesign` from a partial one, filling anything missing with the
 * defaults. Lets callers that only care about a colour — the theme showcase,
 * tests, a future template picker — avoid restating all nine fields.
 */
export function coverDesign(
  coverColor: number,
  overrides: Partial<CoverDesign> = {},
): CoverDesign {
  return { ...DEFAULT_COVER_DESIGN, coverColor, ...overrides };
}
