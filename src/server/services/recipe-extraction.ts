import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { CreateRecipeValues } from "@/app/cookbooks/[id]/recipes/recipe-form-data";
import { aiImportRepository } from "@/server/repositories/ai-import.repository";
import { ok, err, type Result } from "@/server/result";
import type { ImportError } from "./recipe-import.service";

// Asking Claude for a recipe's shape, for the importers whose source isn't
// structured: a photo, a video's caption and transcript. Each importer decides
// what to send and what to say when it goes wrong; this is only the asking.
//
// It costs real money per call, which is why every caller is gated behind
// `canImportInto` like every other importer, even though importing doesn't
// write anything — and why each user gets a daily allowance of calls, counted
// here so that no importer can forget to.

/** How many times a day one person can have Claude read a recipe for them. */
export const AI_IMPORTS_PER_DAY = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

const LIMITED: ImportError = {
  kind: "limited",
  message: `You've used today's ${AI_IMPORTS_PER_DAY} AI imports. You can still paste a recipe, add one from a recipe site's link, or type it into the form.`,
};

const recipeSchema = z.object({
  title: z.string().describe("The recipe's title, or \"\" if none is given."),
  description: z
    .string()
    .describe("A one-line description, or \"\" if the source doesn't have one."),
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
      "One complete instruction per step, in order. Group line breaks or dashes back into one step when they're really one instruction (e.g. \"Bake 350°\" and \"1 hr 15 min\" on separate lines is one step, \"bake for 1 hr 15 min at 350°\", not two) — split by what a cook would treat as a separate action, not by the source's line breaks.",
    ),
});

let client: Anthropic | undefined;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

/**
 * Ask Claude to read a recipe out of `content`.
 *
 * The caller names what to tell the user in each way this can fail, since only
 * it knows what it sent: a request that failed (`unreachable` — try again), or
 * an answer with no recipe in it (`unparseable` — nothing to cook from, or a
 * reply that didn't fit the schema).
 *
 * Refuses with `limited`, without calling Claude, once `userId` has had
 * `AI_IMPORTS_PER_DAY` calls in the last 24 hours. A call counts whether or not
 * it finds a recipe — it's billed either way.
 */
export async function extractRecipe(
  userId: string,
  content: Anthropic.ContentBlockParam[],
  messages: { unreachable: string; unparseable: string },
  now: Date = new Date(),
): Promise<Result<CreateRecipeValues, ImportError>> {
  const since = new Date(now.getTime() - DAY_MS);
  if (!(await aiImportRepository.claim(userId, AI_IMPORTS_PER_DAY, since))) {
    return err(LIMITED);
  }

  let parsed: z.infer<typeof recipeSchema> | null;
  try {
    const response = await anthropic().messages.parse({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      messages: [{ role: "user", content }],
      output_config: { format: zodOutputFormat(recipeSchema) },
    });
    parsed = response.parsed_output;
  } catch (cause) {
    console.error("[recipe-extraction] Claude request failed", cause);
    return err({ kind: "unreachable", message: messages.unreachable });
  }

  if (!parsed || (parsed.ingredients.length === 0 && parsed.steps.length === 0)) {
    return err({ kind: "unparseable", message: messages.unparseable });
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
