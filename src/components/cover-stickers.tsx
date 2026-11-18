import type { StickerName } from "@/lib/cover-elements";

/**
 * Placeholder sticker art, until the real drawings arrive.
 *
 * Each one is a flat drawing on a 100×100 box with a dark keyline, coloured
 * only from the cover palette's own tokens, so a sticker on a book looks like
 * it came from the same shelf. To swap in the real art, replace a drawing here
 * and keep its key — the key is what each cover stores, so every book wearing
 * a sticker picks up the new art with no data change.
 *
 * No "use client": plain SVG, drawn on the server for the shelf and in the
 * browser for the editor.
 */

const C = {
  dark: "var(--color-book-cover-1)",
  red: "var(--color-book-cover-2)",
  wood: "var(--color-book-cover-4)",
  mustard: "var(--color-book-cover-5)",
  deepRed: "var(--color-book-cover-6)",
  olive: "var(--color-book-cover-7)",
  white: "var(--color-book-ink-1)",
};

/** The keyline every sticker is drawn with. */
const line = {
  stroke: C.dark,
  strokeWidth: 3,
  strokeLinejoin: "round",
  strokeLinecap: "round",
} as const;

const DRAWINGS: Record<StickerName, React.ReactNode> = {
  tomato: (
    <>
      <ellipse cx="50" cy="58" rx="36" ry="32" fill={C.red} {...line} />
      <path d="M30 46 Q36 40 44 42" fill="none" stroke={C.white} strokeWidth="4" strokeLinecap="round" opacity="0.7" />
      <path
        d="M50 30 L42 20 L50 25 L56 16 L58 27 L68 24 L60 32 Z"
        fill={C.olive}
        {...line}
      />
    </>
  ),
  lemon: (
    <>
      <path
        d="M14 54 Q20 26 50 24 Q80 26 86 54 Q80 80 50 80 Q20 80 14 54 Z"
        fill={C.mustard}
        {...line}
      />
      <path d="M86 54 L94 52" {...line} />
      <path d="M30 42 Q38 34 48 34" fill="none" stroke={C.white} strokeWidth="4" strokeLinecap="round" opacity="0.7" />
    </>
  ),
  chili: (
    <>
      <path
        d="M70 22 Q84 40 70 64 Q56 86 22 86 Q46 76 54 56 Q62 36 70 22 Z"
        fill={C.red}
        {...line}
      />
      <path d="M70 22 Q72 12 82 10" fill="none" {...line} stroke={C.olive} strokeWidth="6" />
      <path d="M70 22 Q72 12 82 10" fill="none" {...line} />
    </>
  ),
  herb: (
    <>
      <path d="M50 92 Q48 60 52 14" fill="none" {...line} />
      {[
        "M51 70 Q30 66 26 50 Q44 52 51 70 Z",
        "M51 66 Q72 62 76 46 Q58 48 51 66 Z",
        "M51 46 Q32 42 30 26 Q46 30 51 46 Z",
        "M52 42 Q70 38 72 22 Q56 26 52 42 Z",
        "M52 24 Q46 14 52 6 Q58 14 52 24 Z",
      ].map((d) => (
        <path key={d} d={d} fill={C.olive} {...line} />
      ))}
    </>
  ),
  whisk: (
    <>
      <rect x="44" y="62" width="12" height="32" rx="5" fill={C.deepRed} {...line} />
      <path
        d="M50 62 Q24 40 38 10 M50 62 Q76 40 62 10 M50 62 Q40 36 46 8 M50 62 Q60 36 54 8 M38 10 Q50 2 62 10"
        fill="none"
        {...line}
      />
    </>
  ),
  spoon: (
    <>
      <ellipse cx="50" cy="26" rx="16" ry="20" fill={C.wood} {...line} />
      <rect x="45" y="44" width="10" height="50" rx="5" fill={C.wood} {...line} />
      <ellipse cx="50" cy="26" rx="8" ry="11" fill={C.white} opacity="0.35" />
    </>
  ),
  heart: (
    <path
      d="M50 86 Q12 60 12 36 Q12 16 32 16 Q44 16 50 28 Q56 16 68 16 Q88 16 88 36 Q88 60 50 86 Z"
      fill={C.red}
      {...line}
    />
  ),
  star: (
    <path
      d="M50 8 L61 36 L91 38 L68 57 L76 87 L50 70 L24 87 L32 57 L9 38 L39 36 Z"
      fill={C.mustard}
      {...line}
    />
  ),
};

export function Sticker({
  name,
  className = "",
}: {
  name: StickerName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden
      className={className}
      // The keyline is drawn in viewBox units and should scale with the
      // sticker, the way a printed outline would.
      overflow="visible"
    >
      {DRAWINGS[name] ?? DRAWINGS.star}
    </svg>
  );
}
