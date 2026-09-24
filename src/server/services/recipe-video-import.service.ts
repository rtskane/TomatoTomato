import type { CreateRecipeValues } from "@/app/cookbooks/[id]/recipes/recipe-form-data";
import { parseRecipeFromHtml } from "@/lib/recipe-jsonld";
import {
  namesTheSameDish,
  readTikTokPage,
  readYouTubePage,
  recipeLinksIn,
  transcriptFromVtt,
  type VideoDetails,
  type VideoLink,
} from "@/lib/recipe-video";
import { ok, err, type Result } from "@/server/result";
import { extractRecipe } from "./recipe-extraction";
import type { ImportError } from "./recipe-import.service";
import { fetchText } from "./safe-fetch";

// Getting a recipe out of a TikTok or YouTube video. Reached through the link
// importer, which recognises a video link and hands it here — so a video is
// pasted into the same box as any other link.
//
// Reading the pages is `recipe-video.ts`; this decides what to believe.

/**
 * How much of a caption or transcript goes to Claude. A cooking video's text is
 * a few thousand characters at most; past this it's a livestream or a
 * description padded with links, and the recipe, if any, is already in.
 */
const MAX_VIDEO_TEXT = 20_000;

const NO_RECIPE_MESSAGE =
  "We couldn't find a recipe in that video. If the creator wrote it out somewhere — their bio, their site — copy it and add it with “Paste a recipe” instead.";

/** The spoken words of a video, or "" — a missing transcript is not a failure. */
async function readTranscript(url: URL): Promise<string> {
  const vtt = await fetchText(url, "text/vtt,text/plain;q=0.9,*/*;q=0.1");
  return vtt.ok ? transcriptFromVtt(vtt.value) : "";
}

/**
 * The recipes published at `links`, in the links' order, leaving out any that
 * publish none. Fetched together, since most will fail and waiting on each in
 * turn would stack the timeouts.
 */
async function recipesAt(links: URL[]): Promise<CreateRecipeValues[]> {
  const recipes = await Promise.all(
    links.map(async (link) => {
      const page = await fetchText(link);
      return page.ok ? parseRecipeFromHtml(page.value) : null;
    }),
  );
  return recipes.filter((recipe) => recipe !== null);
}

function videoPrompt(platform: string, details: VideoDetails, transcript: string): string {
  const parts = [
    `This is the text from a cooking video on ${platform}. Extract the recipe it describes.`,
  ];
  if (details.title) parts.push(`Video title:\n${details.title}`);
  if (details.caption.trim()) {
    parts.push(
      `What the creator wrote under the video:\n<caption>\n${details.caption.slice(0, MAX_VIDEO_TEXT)}\n</caption>`,
    );
  }
  if (transcript) {
    parts.push(
      `What's said in the video, as an automatic transcript that may mishear words:\n<transcript>\n${transcript.slice(0, MAX_VIDEO_TEXT)}\n</transcript>`,
    );
  }
  parts.push(`The recipe may be split between these — amounts in the caption, the method spoken aloud — so combine them. Correct an obvious mishearing (like "time" for "thyme") only where the context makes it certain.

Leave a field as "" if it isn't stated; never guess or invent a value. An ingredient mentioned without an amount gets quantity "". Ignore hashtags, sponsor messages and requests to like or subscribe. For the title, use the name of the dish (e.g. "Baked Feta Pasta"), not a video title written to get clicks.

If there's no recipe here — for example the text only says it's in the creator's bio or in another video — return no ingredients and no steps.`);
  return parts.join("\n\n");
}

/**
 * Import a recipe from a TikTok or YouTube video.
 *
 * In order of trust:
 *
 * 1. A recipe linked from the caption whose title names the dish the video is
 *    about — the creator's own structured data, read like any link.
 * 2. Claude reading the caption together with what's said in the video.
 * 3. When the video itself holds no recipe ("you NEED to try this 😍") and
 *    links exactly one, that one: nothing in the video says otherwise, and the
 *    creator linked it from here.
 *
 * With several linked recipes, none named in the video, there's nothing to
 * choose between them with, so it says so rather than guess.
 *
 * Only called from `importFromUrl`, after its permission check.
 */
export async function importFromVideo(
  video: VideoLink,
): Promise<Result<CreateRecipeValues, ImportError>> {
  if (video.platform === "instagram") {
    // Measured: every Instagram page answers a server with a login wall.
    return err({
      kind: "unreachable",
      message:
        "Instagram doesn't let us read reels. Copy the reel's caption and add it with “Paste a recipe” instead.",
    });
  }

  const page = await fetchText(video.url);
  if (!page.ok) return page;

  const details =
    video.platform === "tiktok"
      ? readTikTokPage(page.value)
      : readYouTubePage(page.value);
  if (!details) {
    return err({
      kind: "unparseable",
      message:
        "We couldn't read that video's page. Copy its caption and add it with “Paste a recipe” instead.",
    });
  }

  const [transcript, linked] = await Promise.all([
    details.transcriptUrl ? readTranscript(details.transcriptUrl) : "",
    recipesAt(recipeLinksIn(details.caption)),
  ]);

  const videoText = [details.title, details.caption, transcript].join("\n");
  const named = linked.find((recipe) => namesTheSameDish(recipe.title, videoText));
  if (named) return ok(named);

  // A caption with a link in it is never empty, so this has nothing linked to
  // fall back to either.
  if (!details.caption.trim() && !transcript) {
    return err({ kind: "unparseable", message: NO_RECIPE_MESSAGE });
  }

  const platform = video.platform === "tiktok" ? "TikTok" : "YouTube";
  const fromVideo = await extractRecipe(
    [{ type: "text", text: videoPrompt(platform, details, transcript) }],
    {
      unreachable:
        "We couldn't read that video with AI right now. Try again, or copy its caption and add it with “Paste a recipe” instead.",
      unparseable: NO_RECIPE_MESSAGE,
    },
  );
  if (fromVideo.ok || fromVideo.error.kind !== "unparseable") return fromVideo;

  if (linked.length === 1) return ok(linked[0]);
  if (linked.length > 1) {
    return err({
      kind: "unparseable",
      message:
        "That video links to more than one recipe, and we couldn't tell which it's for. Open the right one and paste its link here instead.",
    });
  }
  return fromVideo;
}
