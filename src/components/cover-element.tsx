import Image from "next/image";
import { Sticker } from "@/components/cover-stickers";
import {
  colorCss,
  hasOutline,
  TEXT_FONT_STYLES,
  type CoverElement,
} from "@/lib/cover-elements";

/**
 * One thing placed on a cover, drawn at its place on the board.
 *
 * Rendered by `BookCover` only — the shelf and the editor both draw elements
 * through the book, never on their own — so an element can't look one way in
 * the editor and another on the shelf.
 *
 * Everything is sized against the board: positions and boxes in percentages of
 * it, type in `cqw` of it (the board is the `@container`). That is what lets
 * the same element sit in the same place at 240px and at 36px.
 *
 * `data-element-id` is how the editor finds which element a press landed on
 * and measures its box; nothing else reads it.
 */
export default function CoverElementView({
  element,
  sizes,
}: {
  element: CoverElement;
  /** The cover's own `sizes`, for sizing a photo's download. */
  sizes?: string;
}) {
  const box: React.CSSProperties = {
    left: `${element.x * 100}%`,
    top: `${element.y * 100}%`,
    width: `${element.w * 100}%`,
    transform: `translate(-50%, -50%) rotate(${element.rotation}deg)`,
  };

  const common = {
    "data-element-id": element.id,
    style: box,
    className: "absolute",
  };

  switch (element.type) {
    case "text":
      return (
        <p
          {...common}
          className={`absolute leading-[1.15] break-words whitespace-pre-wrap ${
            TEXT_FONT_STYLES[element.font]?.className ?? "font-serif"
          } ${element.bold ? "font-bold" : "font-normal"} ${element.italic ? "italic" : ""}`}
          style={{
            ...box,
            fontSize: `${element.size}cqw`,
            color: colorCss(element.color),
            textAlign: element.align,
          }}
        >
          {element.text}
        </p>
      );

    case "photo":
      return (
        <div
          {...common}
          className={`absolute overflow-hidden ${
            element.mask === "circle"
              ? "rounded-full"
              : element.mask === "rounded"
                ? "rounded-[4cqw]"
                : ""
          }`}
          style={{ ...box, height: `${element.h * 100}%` }}
        >
          <Image
            src={element.url}
            alt=""
            fill
            // A placed photo is a fraction of the cover, so the cover's own
            // `sizes` is a safe upper bound for it.
            sizes={sizes}
            className="pointer-events-none object-cover"
            draggable={false}
          />
        </div>
      );

    case "shape": {
      const color = colorCss(element.color);
      const outline = element.outline && hasOutline(element.shape);
      return (
        <div
          {...common}
          className={`absolute ${element.shape === "circle" ? "rounded-full" : ""}`}
          style={{
            ...box,
            height: `${element.h * 100}%`,
            ...(outline
              ? { border: `1.6cqw solid ${color}` }
              : { backgroundColor: color }),
            ...(element.shape === "triangle"
              ? { clipPath: "polygon(50% 0, 100% 100%, 0 100%)" }
              : {}),
          }}
        />
      );
    }

    case "sticker":
      return (
        <div {...common} className="absolute aspect-square">
          <Sticker name={element.sticker} className="size-full" />
        </div>
      );
  }
}
