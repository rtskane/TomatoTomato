import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { CreateRecipeValues } from "@/app/cookbooks/[id]/recipes/recipe-form-data";
import { MAX_IMAGE_BYTES } from "@/lib/image-uploads";
import { ok, err, type Result } from "@/server/result";
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
//
// It costs real money per call, which is why it's gated behind
// `canImportInto` like every other importer, even though importing doesn't
// write anything.

// The client always re-encodes to this before sending, so this is the only
// media type a legitimate request ever carries.
const PHOTO_MEDIA_TYPE = "image/jpeg";

const recipeFromPhotoSchema = z.object({
  title: z.string().describe("The recipe's title, or \"\" if none is written."),
  description: z
    .string()
    .describe("A one-line description, or \"\" if the card doesn't have one."),
  servings: z
    .string()
    .describe("Number of servings as plain digits (e.g. \"6\"), or \"\" if not stated."),
  prepTimeMinutes: z
    .string()
    .describe("Prep time in minutes as plain digits, or \"\" if not stated."),
  cookTimeMinutes: z
    .string()
    .describe("Cook or bake time in minutes as plain digits, or \"\" if not stated."),
  ingredients: z.array(
    z.object({
      name: z.string().describe("The ingredient itself, e.g. \"flour\"."),
      quantity: z
        .string()
        .describe("As written, e.g. \"1\", \"1/2\", \"3 1/2\", or \"\" if none."),
      unit: z.string().describe("e.g. \"cup\", \"tsp\", \"g\", or \"\" if none."),
      note: z
        .string()
        .describe("Anything else, e.g. \"chopped\", \"room temperature\", or \"\"."),
    }),
  ),
  steps: z
    .array(z.string())
    .describe(
      "One complete instruction per step, in the order they're written. Group a card's line breaks or dashes back into one step when they're really one instruction (e.g. \"Bake 350°\" and \"1 hr 15 min\" on separate lines is one step, \"bake for 1 hr 15 min at 350°\", not two) — split by what a cook would treat as a separate action, not by the card's line breaks.",
    ),
});

const PROMPT = `This is a photo of a handwritten or printed recipe — a card, a cookbook page, a note. Read it carefully and extract the recipe.

Leave a field as "" if it isn't present in the photo; never guess or invent a value. Transcribe wording as written rather than paraphrasing it. Split ingredient lines into quantity, unit and name the way the recipe form does — put anything that isn't a quantity or unit (like "chopped" or "room temperature") in note.`;

let client: Anthropic | undefined;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

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

  let parsed: z.infer<typeof recipeFromPhotoSchema> | null;
  try {
    const response = await anthropic().messages.parse({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: PHOTO_MEDIA_TYPE, data },
            },
            { type: "text", text: PROMPT },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(recipeFromPhotoSchema) },
    });
    parsed = response.parsed_output;
  } catch (cause) {
    console.error("[recipe-photo-import] Claude request failed", cause);
    return err({
      kind: "unreachable",
      message:
        "We couldn't read that photo with AI right now. Try again, or paste the recipe instead.",
    });
  }

  if (!parsed || (parsed.ingredients.length === 0 && parsed.steps.length === 0)) {
    return err({
      kind: "unparseable",
      message:
        "We couldn't make a recipe out of that photo. Try a clearer shot, or paste it instead.",
    });
  }

  return ok({
    title: parsed.title,
    description: parsed.description,
    servings: parsed.servings,
    prepTimeMinutes: parsed.prepTimeMinutes,
    cookTimeMinutes: parsed.cookTimeMinutes,
    coverImageUrl: "",
    ingredients: parsed.ingredients,
    steps: parsed.steps,
  });
}
