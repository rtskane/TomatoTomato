import { isCoverColor, isCoverTexture, type CoverDesign } from "@/lib/book-covers";
import { isStoredImageUrl } from "@/lib/image-uploads";

// A cookbook that is still being made: the name typed so far and the cover
// chosen so far, kept in the browser until "Create cookbook" turns them into
// a real one.
//
// The cookbook isn't created until the name and the cover are both settled —
// they are chosen on one screen, each redrawing the other — so until then
// there is no row to hold the work. This is what holds it instead: a refresh,
// a closed tab or a wandering Back button brings it back as it was.
//
// Framework-free: parsing and serialising only. The page owns the storage
// calls, because storage can throw (private browsing, a full disk) and what
// to do about that is the page's decision.

/** Versioned in the key, so a change of shape simply stops reading old drafts. */
export const DRAFT_KEY = "cookbook-draft:v1";

export type CookbookDraft = {
  title: string;
  /** Which ready-made cover is picked, or null for the person's own design. */
  templateId: string | null;
  /** Their own design, once they have opened the editor. Kept while they browse templates. */
  custom: CoverDesign | null;
};

export const EMPTY_DRAFT: CookbookDraft = {
  title: "",
  templateId: null,
  custom: null,
};

/**
 * Whether a stored design is the right *shape* to draw.
 *
 * Deliberately shallow. This is the person's own browser handing back what
 * this page wrote, so it isn't a trust boundary — the server validates every
 * field when the cookbook is created. The check only has to stop a draft from
 * an older shape, or a hand-edited one, from crashing the page that restores
 * it. Pictures are the one thing looked at closely, because that is the one
 * way it *can* crash: the image component refuses a URL from a host it
 * doesn't know, and a draft that throws on every visit can't be got rid of.
 */
function isDesign(value: unknown): value is CoverDesign {
  if (typeof value !== "object" || value === null) return false;
  const d = value as Record<string, unknown>;
  return (
    typeof d.coverColor === "number" &&
    isCoverColor(d.coverColor) &&
    typeof d.coverTexture === "string" &&
    isCoverTexture(d.coverTexture) &&
    (d.coverImageUrl == null || isOurImage(d.coverImageUrl)) &&
    Array.isArray(d.coverElements) &&
    d.coverElements.every((e) => {
      if (typeof e !== "object" || e === null) return false;
      const element = e as { id?: unknown; type?: unknown; url?: unknown };
      if (typeof element.id !== "string") return false;
      return element.type !== "photo" || isOurImage(element.url);
    })
  );
}

function isOurImage(url: unknown): boolean {
  return typeof url === "string" && isStoredImageUrl(url);
}

/** A stored draft, or null when there isn't one worth restoring. */
export function parseDraft(raw: string | null): CookbookDraft | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const d = value as Record<string, unknown>;

  const draft: CookbookDraft = {
    title: typeof d.title === "string" ? d.title.slice(0, 80) : "",
    templateId: typeof d.templateId === "string" ? d.templateId : null,
    custom: isDesign(d.custom) ? d.custom : null,
  };
  return isEmptyDraft(draft) ? null : draft;
}

/** Nothing typed and nothing chosen — not worth keeping, or restoring. */
export function isEmptyDraft(draft: CookbookDraft): boolean {
  return draft.title.trim() === "" && draft.templateId === null && draft.custom === null;
}
