import type { CreateRecipeValues } from "@/app/cookbooks/[id]/recipes/recipe-form-data";
import { parseRecipeText } from "@/lib/recipe-import";
import { parseRecipeFromHtml } from "@/lib/recipe-jsonld";
import { recognizeVideoLink } from "@/lib/recipe-video";
import { cookbookRepository } from "@/server/repositories/cookbook.repository";
import { canAddRecipes } from "@/server/permissions";
import { ok, err, type Result } from "@/server/result";
import { importFromVideo } from "./recipe-video-import.service";
import { fetchText, parseUserUrl } from "./safe-fetch";

// Getting a recipe out of somewhere that isn't our form.
//
// Nothing here writes to the database. Every path returns `CreateRecipeValues`
// — the same shape the form speaks — which the page hands straight to
// `RecipeForm` for the author to check over. The existing `createRecipe` is
// still the only thing that saves, so an import can never store a recipe
// nobody looked at.

export type ImportError = {
  kind: "forbidden" | "invalid" | "blocked" | "unreachable" | "unparseable";
  message: string;
};

export const FORBIDDEN: ImportError = {
  kind: "forbidden",
  message: "You don't have permission to add recipes to this cookbook.",
};

/**
 * Importing is gated on being able to add recipes to *this* cookbook, which is
 * stricter than it looks like it needs to be: importing doesn't write, so a
 * membership check might seem like ceremony.
 *
 * It isn't. `importFromUrl` makes our server fetch a URL of the caller's
 * choosing, and an endpoint that does that for any signed-in user is a fetching
 * service we host for strangers. Tying it to a cookbook they can already write
 * to keeps it in proportion to what it's for — every importer shares this
 * check, including the photo-to-AI one, which spends real money per call.
 */
export async function canImportInto(userId: string, cookbookId: string) {
  const membership = await cookbookRepository.findMembership(cookbookId, userId);
  return Boolean(membership && canAddRecipes(membership.role));
}

/**
 * Import a recipe from a link.
 *
 * Only the publisher's own structured data is trusted. When a page hasn't got
 * any, this reports that rather than scraping the visible text — a recipe page
 * is mostly navigation, comments and advertising, and a "recipe" assembled out
 * of those is worse than no import at all, because the author has to find the
 * damage before they can fix it.
 *
 * Video links are the exception, and go to `importFromVideo`: a video page has
 * no structured recipe, but what's on it — a caption, a transcript — is the
 * creator's own words about the recipe, not a page's clutter around it.
 */
export async function importFromUrl(
  userId: string,
  cookbookId: string,
  input: string,
): Promise<Result<CreateRecipeValues, ImportError>> {
  // Before anything else, so a stranger can't even learn whether a URL passes.
  if (!(await canImportInto(userId, cookbookId))) return err(FORBIDDEN);

  const url = parseUserUrl(input);
  if (!url.ok) return url;

  const video = recognizeVideoLink(url.value);
  if (video) return importFromVideo(video);

  const page = await fetchText(url.value);
  if (!page.ok) return page;

  const recipe = parseRecipeFromHtml(page.value);
  if (!recipe) {
    return err({
      kind: "unparseable",
      message:
        "We couldn't find a recipe on that page. Copy the recipe from it and add it with “Paste a recipe” instead.",
    });
  }

  return ok(recipe);
}

/** Import a recipe from text someone pasted. */
export async function importFromText(
  userId: string,
  cookbookId: string,
  text: string,
): Promise<Result<CreateRecipeValues, ImportError>> {
  if (!(await canImportInto(userId, cookbookId))) return err(FORBIDDEN);

  if (text.trim() === "") {
    return err({ kind: "invalid", message: "Paste a recipe to import." });
  }

  const recipe = parseRecipeText(text);
  if (recipe.ingredients.length === 0 && recipe.steps.length === 0) {
    return err({
      kind: "unparseable",
      message: "We couldn't make a recipe out of that. Try adding a bit more.",
    });
  }

  return ok(recipe);
}
