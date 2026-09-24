import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  readTikTokPage,
  readYouTubePage,
  namesTheSameDish,
  recipeLinksIn,
  recognizeVideoLink,
  transcriptFromVtt,
} from "./recipe-video";

// The fixtures are real pages fetched server-side on 2026-09-23, trimmed to
// the script each reader looks in. The data inside them is untouched.
const fixture = (name: string) =>
  readFileSync(join(__dirname, "__fixtures__", name), "utf8");

const recognize = (href: string) => recognizeVideoLink(new URL(href));

describe("recognizeVideoLink", () => {
  it.each([
    "https://www.tiktok.com/@butterworthdasyrup/video/7484033605795204394?lang=en",
    "https://m.tiktok.com/v/7484033605795204394.html",
    "https://vm.tiktok.com/ZMabc123/",
    "https://vt.tiktok.com/ZSabc123/",
  ])("recognises the TikTok link %s, and fetches it as given", (href) => {
    expect(recognize(href)).toEqual({ platform: "tiktok", url: new URL(href) });
  });

  // Shorts, share links and watch pages are the same video, and the watch page
  // is the one that reliably carries the description.
  it.each([
    "https://www.youtube.com/watch?v=9vdF9Cgy7zc",
    "https://youtube.com/watch?v=9vdF9Cgy7zc&t=42s",
    "https://m.youtube.com/watch?v=9vdF9Cgy7zc",
    "https://www.youtube.com/shorts/9vdF9Cgy7zc",
    "https://youtube.com/shorts/9vdF9Cgy7zc?feature=share",
    "https://youtu.be/9vdF9Cgy7zc",
    "https://youtu.be/9vdF9Cgy7zc?si=abc",
    // A fully qualified name is the same host.
    "https://www.youtube.com./watch?v=9vdF9Cgy7zc",
    "https://www.youtube.com/live/9vdF9Cgy7zc",
  ])("turns the YouTube link %s into its watch page", (href) => {
    expect(recognize(href)).toEqual({
      platform: "youtube",
      url: new URL("https://www.youtube.com/watch?v=9vdF9Cgy7zc"),
    });
  });

  it.each([
    "https://www.instagram.com/reel/C_CXETzxJc3/",
    "https://instagram.com/p/C_CXETzxJc3/?igsh=abc",
  ])("recognises the Instagram link %s", (href) => {
    expect(recognize(href)).toEqual({ platform: "instagram" });
  });

  it.each([
    "https://www.kingarthurbaking.com/recipes/classic-birthday-cake",
    // A YouTube page that isn't a video.
    "https://www.youtube.com/@supereasyrecipe/shorts",
    "https://www.youtube.com/watch",
    "https://www.youtube.com/watch?v=not-an-id",
    // Nothing to identify the video by.
    "https://youtu.be/",
    "https://www.youtube.com/shorts/",
    // Only the platform's own domain counts.
    "https://notyoutube.com/watch?v=9vdF9Cgy7zc",
    "https://tiktok.com.example.com/@x/video/1",
  ])("leaves %s to the ordinary link importer", (href) => {
    expect(recognize(href)).toBeNull();
  });
});

describe("readTikTokPage", () => {
  it("reads the caption and where to find the transcript", () => {
    const video = readTikTokPage(fixture("tiktok-video.html"));

    expect(video?.title).toBe("");
    expect(video?.caption).toContain("2 pints tomato 1 shallot 3 cloves garlic 1/2 cup");
    expect(video?.transcriptUrl?.hostname).toBe("v16m-webapp.tiktokcdn-us.com");
  });

  const page = (subtitleInfos: unknown) =>
    `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(
      {
        __DEFAULT_SCOPE__: {
          "webapp.video-detail": {
            itemInfo: { itemStruct: { desc: "Soup", video: { subtitleInfos } } },
          },
        },
      },
    )}</script>`;
  const transcriptOf = (subtitleInfos: unknown) =>
    readTikTokPage(page(subtitleInfos))?.transcriptUrl?.href;

  const subtitle = (lang: string, url: string | undefined, format = "webvtt") => ({
    LanguageCodeName: lang,
    Url: url,
    Format: format,
  });

  it("prefers an English transcript, then any", () => {
    const fr = subtitle("fra-FR", "https://cdn.example/fr");
    const en = subtitle("eng-US", "https://cdn.example/en");

    expect(transcriptOf([fr, en])).toBe("https://cdn.example/en");
    expect(transcriptOf([fr])).toBe("https://cdn.example/fr");
  });

  it("skips subtitles it can't use", () => {
    // Only WebVTT is understood.
    expect(transcriptOf([subtitle("eng-US", "https://cdn.example/x", "creator_caption")])).toBeUndefined();
    expect(transcriptOf([subtitle("eng-US", undefined)])).toBeUndefined();
    expect(transcriptOf([subtitle("eng-US", "not a url")])).toBeUndefined();
    expect(transcriptOf([])).toBeUndefined();
    // A video with no speech has no list at all.
    expect(transcriptOf(undefined)).toBeUndefined();
    // A bad entry doesn't hide a good one after it.
    expect(transcriptOf([subtitle("eng-US", "not a url"), subtitle("fra-FR", "https://cdn.example/fr")])).toBe(
      "https://cdn.example/fr",
    );
  });

  it("returns null for a page without the video's data", () => {
    expect(readTikTokPage("<html><body>Log in</body></html>")).toBeNull();
    expect(
      readTikTokPage(
        '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">{not json</script>',
      ),
    ).toBeNull();
  });
});

describe("readYouTubePage", () => {
  it("reads the title and the whole description", () => {
    const video = readYouTubePage(fixture("youtube-watch.html"));

    expect(video?.title).toContain("Soft Yeast Buns Recipe");
    expect(video?.caption).toContain("📌 INGREDIENTS:\n- 1 cup warm milk");
    expect(video?.caption).toContain("#itsbakingtime");
    expect(video?.transcriptUrl).toBeUndefined();
  });

  // The object is found by matching braces, so braces and quotes inside the
  // description's text mustn't end it early.
  it("isn't thrown by braces and quotes inside the text", () => {
    const player = {
      videoDetails: { title: "Pie", shortDescription: 'Crust: {"flour"} \\ }}} then bake' },
    };
    const html = `<script>var ytInitialPlayerResponse = ${JSON.stringify(player)};var x = {};</script>`;

    expect(readYouTubePage(html)).toEqual({
      title: "Pie",
      caption: 'Crust: {"flour"} \\ }}} then bake',
    });
  });

  it("returns null for a page without the video's data, like a consent wall", () => {
    expect(readYouTubePage("<html><body>Before you continue</body></html>")).toBeNull();
    expect(readYouTubePage("var ytInitialPlayerResponse = {\"videoDetails\":")).toBeNull();
    expect(readYouTubePage("var ytInitialPlayerResponse = null;")).toBeNull();
    // Fields that aren't text read as empty rather than crashing.
    expect(
      readYouTubePage('var ytInitialPlayerResponse = {"videoDetails":{"title":7}};'),
    ).toEqual({ title: "", caption: "" });
  });
});

describe("transcriptFromVtt", () => {
  it("reads a real TikTok transcript as running text", () => {
    const text = transcriptFromVtt(fixture("tiktok-transcript.vtt"));

    expect(text).toMatch(
      /^Did you know if you dump 2 pints of tomatoes into a pot, then add one quartered shallot, 3 cloves of garlic/,
    );
    expect(text).not.toMatch(/WEBVTT|-->/);
  });

  it("drops cue ids, settings, markup, NOTE blocks and repeated lines", () => {
    const vtt = [
      "WEBVTT",
      "",
      "NOTE made by a machine",
      "",
      "1",
      "00:00:00.000 --> 00:00:02.000 align:start",
      "<c>Melt the</c> butter",
      "",
      "2",
      "00:00:02.000 --> 00:00:03.000",
      "<c>Melt the</c> butter",
      "then add flour",
    ].join("\r\n");

    expect(transcriptFromVtt(vtt)).toBe("Melt the butter then add flour");
  });
});

describe("recipeLinksIn", () => {
  const hrefs = (text: string) => recipeLinksIn(text).map((url) => url.href);

  it("finds the blog link in a real caption", () => {
    expect(
      hrefs(
        "Click the link in my bio or grab the recipe right here: https://hollyb.co/2024/10/17/that-viral-pasta-that-almost-broke-the-internet/  Who else has that one dish?",
      ),
    ).toEqual(["https://hollyb.co/2024/10/17/that-viral-pasta-that-almost-broke-the-internet/"]);
  });

  it("skips the platforms, shops and link-in-bio pages", () => {
    expect(
      hrefs(
        [
          "Follow me https://www.instagram.com/someone",
          "Pan: https://amzn.to/3abc",
          "More: https://linktr.ee/someone",
          "Subscribe https://youtube.com/@someone",
          "Recipe: https://example.com/buns.",
        ].join("\n"),
      ),
    ).toEqual(["https://example.com/buns"]);
  });

  it("keeps the order, drops repeats and stops at three", () => {
    expect(
      hrefs("https://a.com/1 https://b.com/2 https://a.com/1 https://c.com/3 https://d.com/4"),
    ).toEqual(["https://a.com/1", "https://b.com/2", "https://c.com/3"]);
  });

  it("passes over a link that won't parse", () => {
    expect(hrefs("https://[oops then https://a.com/cake")).toEqual(["https://a.com/cake"]);
  });

  it("finds nothing in a caption without links", () => {
    expect(hrefs("Recipe in my bio! #pasta")).toEqual([]);
  });
});

describe("namesTheSameDish", () => {
  it.each([
    // The real pair: a YouTube title and the recipe its description would link.
    ["Soft Yeast Buns", "“Soft Yeast Buns Recipe | Easy Bread for Beginners with Voiceover”"],
    // Named in the caption or transcript rather than a title.
    ["Baked Feta Pasta", "Put it in a pot with the feta and bake. TikTok pasta!"],
    // Singulars and plurals find each other, both ways.
    ["Tomato Sauce", "roast the tomatoes, blend into sauces"],
    ["Cinnamon Buns", "the softest cinnamon bun"],
    // Case and punctuation don't matter.
    ["Crème Brûlée", "CRÈME BRÛLÉE, the easy way"],
  ])("finds %j in %j", (title, videoText) => {
    expect(namesTheSameDish(title, videoText)).toBe(true);
  });

  it.each([
    // The case this exists for: a description linking another of the
    // creator's recipes.
    ["Weeknight Lasagna", "Easy Chocolate Cake — moist every time"],
    // A link's words are not the video naming the dish.
    ["Weeknight Lasagna", "Chocolate cake! More: https://a.example/lasagna"],
    // The "s" of a possessive is not a word the two share.
    ["Grandma's Apple Pie", "It's grandma's favourite: lemon bars"],
    // One shared word is not the same dish.
    ["Chocolate Chip Cookies", "Easy Chocolate Cake"],
    // Filler words don't count as shared.
    ["The Best Easy Recipe", "the best easy recipe for cake"],
    // A title with nothing telling in it can't be matched to anything.
    ["", "cake"],
    // A vague video names nothing to match.
    ["Birthday Cake", "you NEED to try this 😍"],
  ])("doesn't find %j in %j", (title, videoText) => {
    expect(namesTheSameDish(title, videoText)).toBe(false);
  });
});
