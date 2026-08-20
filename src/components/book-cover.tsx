import Image from "next/image";
import { paletteFor, type CoverStyle } from "@/lib/book-covers";

/**
 * A cookbook drawn as a physical book: cloth boards, a spine down the left,
 * page edges on the right.
 *
 * This is the *only* place a book face is drawn. The shelf, the list's
 * thumbnail chip and the cover designer's preview all render this component,
 * which is what makes the designer honest — the preview isn't a mock-up of the
 * shelf, it is the shelf's own component at a smaller size, so the two cannot
 * drift apart as either changes.
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
 * photograph of one would. The values below are the original pixel sizes
 * divided by the 240px shelf book, so the shelf is unchanged to the pixel.
 */
const SIZES = {
  book: {
    spine: "w-[5cqw]",
    hairlineOffset: "left-[5cqw]",
    foreEdge: "w-[1.25cqw]",
    frame:
      "absolute inset-y-[6.7cqw] right-[6.7cqw] left-[11.7cqw] flex items-center justify-center rounded-xs border px-[3cqw] text-center",
    title: "line-clamp-4 font-serif text-[8.3cqw] leading-[1.2] text-balance",
    radius: "rounded-r-md rounded-l-xs",
  },
  chip: {
    // Not proportional: at 36px wide a 5%-of-width spine is under two pixels
    // and stops reading as a spine at all, so the chip keeps flat sizes.
    spine: "w-1",
    hairlineOffset: "left-1",
    foreEdge: "w-[2px]",
    // A chip never shows a title — at 36px wide there is no type size that is
    // both legible and in proportion, and the title is already sitting next to
    // it in the row.
    frame: null,
    title: null,
    radius: "rounded-xs rounded-l-[1px]",
  },
} as const;

export type BookCoverSize = keyof typeof SIZES;

export default function BookCover({
  title,
  coverColor,
  coverStyle,
  coverImageUrl,
  size = "book",
  sizes,
  className = "",
}: {
  title: string;
  /** Already resolved to 1..COVER_COUNT — see `resolveCoverColor`. */
  coverColor: number;
  coverStyle: CoverStyle;
  coverImageUrl: string | null;
  size?: BookCoverSize;
  /** Passed to next/image; the caller knows how wide this renders. */
  sizes?: string;
  /** The box: aspect ratio, width, and any hover treatment. */
  className?: string;
}) {
  const palette = paletteFor(coverColor);
  const spec = SIZES[size];

  // PHOTO without a picture can't be drawn. The schema folds that combination
  // away on write, so reaching it here means older data or a direct database
  // edit — either way the cloth is a better answer than an empty board.
  const showPhoto = coverStyle === "PHOTO" && Boolean(coverImageUrl);
  const showTitle = !showPhoto && coverStyle !== "PLAIN" && spec.frame !== null;

  return (
    <div
      // `isolate` keeps the -z-10 photo below the spine and fore-edge without
      // escaping behind the page itself. `@container` is what makes the cqw
      // sizes above resolve against this board rather than the viewport.
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
        <Image
          src={coverImageUrl as string}
          alt=""
          fill
          sizes={sizes}
          className="-z-10 object-cover"
        />
      ) : (
        // A flat fill reads as a swatch; a fill with a corner lit reads as
        // cloth. Above the spine in source order but pointer-events-none and
        // purely decorative.
        <span
          className={`pointer-events-none absolute inset-0 -z-10 ${palette.sheen}`}
        />
      )}

      {showTitle ? (
        <div className={`${spec.frame} ${palette.frame}`}>
          <p className={`${spec.title} ${palette.ink}`}>{title}</p>
        </div>
      ) : null}
    </div>
  );
}
