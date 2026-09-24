// Reading what a recipe video's page tells us about it.
//
// Everything here is pure — it takes a URL or a page someone else fetched and
// returns plain text. The fetching, and the decision about what to do with the
// text, live in `recipe-video-import.service.ts`.
//
// What each platform gives a server that asks (measured, not assumed):
//
// - TikTok: the page carries the creator's caption and, for videos with speech,
//   a link to a WebVTT transcript of what's said. Voiceover recipes survive
//   whole.
// - YouTube, Shorts and ordinary videos alike: the page carries the full
//   description, which is where cooking channels put the ingredient list. The
//   captions are not reachable — the timedtext endpoint answers a server with an
//   empty body — so what the cook says out loud is lost.
// - Instagram: every page is a login wall. Nothing to read, so it's recognised
//   only to say so.

export type VideoLink =
  | { platform: "tiktok"; url: URL }
  | { platform: "youtube"; url: URL }
  | { platform: "instagram" };

/** Hostnames without a leading "www." or "m.", which change nothing here. */
function bareHost(url: URL): string {
  return url.hostname.toLowerCase().replace(/\.$/, "").replace(/^(www|m)\./, "");
}

const YOUTUBE_ID = /^[\w-]{11}$/;

/**
 * Which video platform a link points at, if any — and for YouTube, the one
 * canonical page to fetch, since Shorts, youtu.be links and watch pages all
 * carry the same data once asked for as a watch page.
 */
export function recognizeVideoLink(url: URL): VideoLink | null {
  const host = bareHost(url);
  const path = url.pathname.split("/").filter(Boolean);

  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    // vm.tiktok.com and vt.tiktok.com are share links that redirect to the
    // video, so they're fetched as they are.
    return { platform: "tiktok", url };
  }

  if (host === "instagram.com") return { platform: "instagram" };

  let id: string | null = null;
  if (host === "youtu.be") {
    id = path[0] ?? null;
  } else if (host === "youtube.com") {
    if (path[0] === "watch") id = url.searchParams.get("v");
    else if (path[0] === "shorts" || path[0] === "live") id = path[1] ?? null;
  }
  if (id && YOUTUBE_ID.test(id)) {
    return {
      platform: "youtube",
      url: new URL(`https://www.youtube.com/watch?v=${id}`),
    };
  }

  return null;
}

/**
 * The JSON object starting at `start`, as text. Found by matching braces,
 * skipping any inside strings, because the object is nested and embedded in a
 * script — no pattern can say where it ends.
 */
function jsonObjectAt(text: string, start: number): string | null {
  if (text[start] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
    } else if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseJson(text: string | null | undefined): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Walk into untyped JSON without a cast at every step. */
function dig(value: unknown, ...keys: string[]): unknown {
  let current = value;
  for (const key of keys) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

const asString = (value: unknown) => (typeof value === "string" ? value : "");

export type VideoDetails = {
  title: string;
  /** What the creator wrote: a TikTok caption, a YouTube description. */
  caption: string;
  /** Where the words spoken in the video can be read, if anywhere. */
  transcriptUrl?: URL;
};

/**
 * What a YouTube watch page says about its video, or null when the page
 * doesn't carry it — a consent wall, a removed video, a changed page.
 */
export function readYouTubePage(html: string): VideoDetails | null {
  const marker = "ytInitialPlayerResponse = ";
  const at = html.indexOf(marker);
  if (at === -1) return null;

  const details = dig(
    parseJson(jsonObjectAt(html, at + marker.length)),
    "videoDetails",
  );
  if (!details) return null;

  return {
    title: asString(dig(details, "title")),
    caption: asString(dig(details, "shortDescription")),
  };
}

type Subtitle = { lang: string; url: URL };

/** What a TikTok video page says about its video, or null when it doesn't. */
export function readTikTokPage(html: string): VideoDetails | null {
  const script =
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/.exec(
      html,
    )?.[1];
  const item = dig(
    parseJson(script),
    "__DEFAULT_SCOPE__",
    "webapp.video-detail",
    "itemInfo",
    "itemStruct",
  );
  if (!item) return null;

  const subtitles: Subtitle[] = [];
  const infos = dig(item, "video", "subtitleInfos");
  for (const info of Array.isArray(infos) ? infos : []) {
    // Only WebVTT is understood, and TikTok labels it.
    if (asString(dig(info, "Format")).toLowerCase() !== "webvtt") continue;
    const url = URL.parse(asString(dig(info, "Url")));
    if (url) subtitles.push({ lang: asString(dig(info, "LanguageCodeName")), url });
  }
  // English first, since that's who's using this; any language beats none,
  // because Claude can read it either way.
  const transcript =
    subtitles.find((s) => s.lang.toLowerCase().startsWith("eng")) ?? subtitles[0];

  return {
    // TikTok videos have no title apart from their caption.
    title: "",
    caption: asString(dig(item, "desc")),
    transcriptUrl: transcript?.url,
  };
}

/**
 * The words of a WebVTT file as running text: no header, no timings, no cue
 * settings — and no repeated lines, which auto-captions produce as each cue
 * rolls into the next.
 */
export function transcriptFromVtt(vtt: string): string {
  const lines: string[] = [];
  const blocks = vtt.replace(/\r\n?/g, "\n").split(/\n{2,}/);

  for (const block of blocks) {
    const rows = block.split("\n");
    const timing = rows.findIndex((row) => row.includes("-->"));
    // No timing line means a header, NOTE, STYLE or REGION block — not speech.
    if (timing === -1) continue;

    for (const row of rows.slice(timing + 1)) {
      const text = row.replace(/<[^>]*>/g, "").trim();
      if (text && text !== lines[lines.length - 1]) lines.push(text);
    }
  }

  return lines.join(" ");
}

/**
 * Hosts whose links in a caption are never a recipe page: the platforms
 * themselves, shops, and link-in-bio pages.
 */
const NOT_A_RECIPE_HOST = [
  "youtube.com",
  "youtu.be",
  "tiktok.com",
  "instagram.com",
  "facebook.com",
  "fb.com",
  "twitter.com",
  "x.com",
  "threads.net",
  "pinterest.com",
  "snapchat.com",
  "patreon.com",
  "linktr.ee",
  "beacons.ai",
  "amazon.com",
  "amzn.to",
  "spotify.com",
  "apple.com",
];

/** A link written out in a caption. */
const LINK = /https?:\/\/[^\s<>"'()]+/gi;

/** At most this many links from one caption are tried. */
const MAX_RECIPE_LINKS = 3;

/**
 * Links in a caption that might be the recipe written out properly — the
 * "full recipe on my blog: …" that so many videos end with. In the order they
 * appear.
 *
 * Any of them could as easily be a different recipe ("more from me:
 * lasagna"), so what's found at them is only used once `namesTheSameDish`
 * agrees it's this video's.
 */
export function recipeLinksIn(text: string): URL[] {
  const found: URL[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(LINK)) {
    // Sentence punctuation that ends up glued to a link.
    const url = URL.parse(match[0].replace(/[.,;:!?]+$/, ""));
    if (!url) continue;

    const host = bareHost(url);
    const skip = NOT_A_RECIPE_HOST.some(
      (blocked) => host === blocked || host.endsWith(`.${blocked}`),
    );
    if (skip || seen.has(url.href)) continue;

    seen.add(url.href);
    found.push(url);
    if (found.length === MAX_RECIPE_LINKS) break;
  }

  return found;
}

/**
 * Words that say nothing about which dish a title names — the filler, and the
 * praise every recipe title reaches for. Words under three letters never count
 * either, which covers "a", "of" and "to" — and the "s" split off "grandma's",
 * which would otherwise match every "it's".
 */
const NOT_A_DISH_WORD = new Set([
  "and", "the", "with", "for", "your",
  "recipe", "recipes", "easy", "best", "simple", "quick", "homemade", "perfect",
  "ultimate", "classic", "delicious", "healthy", "weeknight", "favorite",
  "favourite", "viral", "how", "make",
]);

const isTelling = (word: string) => word.length >= 3 && !NOT_A_DISH_WORD.has(word);

/**
 * A word and its possible singulars, so "buns" finds "bun", "tomatoes" finds
 * "tomato" and "sauces" finds "sauce". A wrong guess like "glas" matches
 * nothing, which costs nothing.
 */
const forms = (word: string) => [word, word.replace(/s$/, ""), word.replace(/es$/, "")];

const wordsOf = (text: string) => text.toLowerCase().match(/\p{L}+/gu) ?? [];

/**
 * Whether a recipe's title names the dish a video's text is about: at least
 * half of the title's telling words appear in the video's text.
 *
 * The links in that text don't count. Otherwise "more from me:
 * https://example.com/lasagna" would name lasagna, and the very link the check
 * is meant to catch would vouch for itself.
 *
 * One shared word isn't enough — a chocolate cake video and a recipe for
 * chocolate chip cookies share "chocolate". Erring toward "no" is safe: the
 * cost is reading the video itself instead, where "yes" wrongly would import
 * another dish.
 */
export function namesTheSameDish(recipeTitle: string, videoText: string): boolean {
  const telling = [...new Set(wordsOf(recipeTitle).filter(isTelling))];
  if (telling.length === 0) return false;

  const inVideo = new Set(wordsOf(videoText.replace(LINK, " ")).flatMap(forms));
  const shared = telling.filter((word) => forms(word).some((form) => inVideo.has(form))).length;
  return shared >= Math.ceil(telling.length / 2);
}
