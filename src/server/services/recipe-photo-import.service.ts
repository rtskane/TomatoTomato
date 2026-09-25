import type { CreateRecipeValues } from "@/app/cookbooks/[id]/recipes/recipe-form-data";
import { MAX_IMAGE_BYTES } from "@/lib/image-uploads";
import { err, type Result } from "@/server/result";
import { extractRecipe } from "./recipe-extraction";
import {
  canImportInto,
  FORBIDDEN,
  type ImportError,
} from "./recipe-import.service";

// Reading a recipe off a photo: the one importer that leaves the device,
// because it's the one importer that has to — vision reads layout as well as
// characters, which handwriting needs and on-device OCR couldn't deliver.
// It asks Claude for the recipe's shape directly rather than dumping OCR text
// through the free-text parser `importFromText` uses.

// The client always re-encodes to this before sending, so this is the only
// media type a legitimate request ever carries.
const PHOTO_MEDIA_TYPE = "image/jpeg";

const PROMPT = `This is a photo of a handwritten or printed recipe — a card, a cookbook page, a note. Read it carefully and extract the recipe.

Leave a field as "" if it isn't present in the photo; never guess or invent a value. Transcribe wording as written rather than paraphrasing it. Split ingredient lines into quantity, unit and name the way the recipe form does — put anything that isn't a quantity or unit (like "chopped" or "room temperature") in note.`;

/**
 * Import a recipe by sending a photo of it to Claude for extraction.
 *
 * `file` is expected to already be the client's resized, re-encoded JPEG —
 * this only re-validates the shape of what a legitimate request sends, it
 * doesn't do the resizing itself.
 */
export async function importFromPhoto(
  userId: string,
  cookbookId: string,
  file: File,
): Promise<Result<CreateRecipeValues, ImportError>> {
  if (!(await canImportInto(userId, cookbookId))) return err(FORBIDDEN);

  if (file.type !== PHOTO_MEDIA_TYPE) {
    return err({ kind: "invalid", message: "That doesn't look like a photo." });
  }
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) {
    return err({ kind: "invalid", message: "That photo is larger than 8 MB." });
  }

  const data = Buffer.from(await file.arrayBuffer()).toString("base64");

  return extractRecipe(
    userId,
    [
      {
        type: "image",
        source: { type: "base64", media_type: PHOTO_MEDIA_TYPE, data },
      },
      { type: "text", text: PROMPT },
    ],
    {
      unreachable:
        "We couldn't read that photo with AI right now. Try again, or type the recipe out with “Paste a recipe” instead.",
      unparseable:
        "We couldn't make a recipe out of that photo. Try a clearer shot, or type the recipe out with “Paste a recipe” instead.",
    },
  );
}
