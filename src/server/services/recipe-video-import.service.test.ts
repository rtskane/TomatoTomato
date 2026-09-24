import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { fetched, fixture, serve } from "@/lib/__fixtures__/web";
import { recognizeVideoLink } from "@/lib/recipe-video";

const { extractRecipe } = vi.hoisted(() => ({ extractRecipe: vi.fn() }));
vi.mock("./recipe-extraction", () => ({ extractRecipe }));

import { importFromVideo } from "./recipe-video-import.service";

// Links are recognised by `recognizeVideoLink`, as the link importer does
// before handing them here; its own tests cover which links are videos.
const importVideo = (href: string) => {
  const video = recognizeVideoLink(new URL(href));
  if (!video) throw new Error(`not a video link: ${href}`);
  return importFromVideo(video);
};

const TIKTOK = "https://www.tiktok.com/@butterworthdasyrup/video/7484033605795204394";

/** A TikTok page with this caption, and a transcript at this address if given. */
const tiktokPage = (caption: string, transcriptUrl?: string) =>
  `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({
    __DEFAULT_SCOPE__: {
      "webapp.video-detail": {
        itemInfo: {
          itemStruct: {
            desc: caption,
            video: {
              subtitleInfos: transcriptUrl
                ? [{ LanguageCodeName: "eng-US", Url: transcriptUrl, Format: "webvtt" }]
                : [],
            },
          },
        },
      },
    },
  })}</script>`;

/** A page publishing a recipe with this title, as a creator's blog would. */
const recipePage = (name: string) =>
  `<script type="application/ld+json">${JSON.stringify({
    "@type": "Recipe",
    name,
    recipeIngredient: ["1 cup flour"],
  })}</script>`;

const fromClaude = {
  title: "Baked Feta Pasta",
  description: "",
  servings: "",
  prepTimeMinutes: "",
  cookTimeMinutes: "40",
  coverImageUrl: "",
  ingredients: [{ name: "tomatoes", quantity: "2", unit: "pints", note: "" }],
  steps: ["Bake at 400 for 40 minutes."],
};

const CLAUDE_FAILED = {
  ok: false,
  error: { kind: "unreachable", message: "We couldn't read that video with AI right now." },
} as const;

const NOTHING_FOUND = {
  ok: false,
  error: { kind: "unparseable", message: "We couldn't find a recipe in that video." },
} as const;

/** What was sent to Claude. */
const prompt = () => extractRecipe.mock.calls[0][0][0].text as string;

beforeEach(() => {
  vi.clearAllMocks();
  extractRecipe.mockResolvedValue({ ok: true, value: fromClaude });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reading what a video says", () => {
  it("reads a TikTok's caption and spoken transcript together", async () => {
    const fetchSpy = serve({
      [TIKTOK]: fixture("tiktok-video"),
      "https://v16m-webapp.tiktokcdn-us.com/": fixture("tiktok-transcript", "vtt"),
    });

    const result = await importVideo(TIKTOK);

    expect(result).toEqual({ ok: true, value: fromClaude });
    expect(fetched(fetchSpy)).toHaveLength(2);
    expect(prompt()).toContain("on TikTok");
    expect(prompt()).toContain("2 pints tomato 1 shallot");
    expect(prompt()).toContain("dump 2 pints of tomatoes into a pot");
  });

  it("still reads the caption when the transcript can't be fetched", async () => {
    serve({ [TIKTOK]: fixture("tiktok-video") });

    expect((await importVideo(TIKTOK)).ok).toBe(true);
    expect(prompt()).toContain("2 pints tomato 1 shallot");
    expect(prompt()).not.toContain("<transcript>");
  });

  it("reads a video with nothing written under it from its transcript alone", async () => {
    serve({
      [TIKTOK]: tiktokPage("", "https://cdn.example/transcript.vtt"),
      "https://cdn.example/transcript.vtt": "WEBVTT\n\n00:00.000 --> 00:02.000\nMelt the butter",
    });

    expect((await importVideo(TIKTOK)).ok).toBe(true);
    expect(prompt()).toContain("Melt the butter");
    expect(prompt()).not.toContain("<caption>");
  });

  it("reads a YouTube Short's description from its watch page", async () => {
    const fetchSpy = serve({
      "https://www.youtube.com/watch?v=9vdF9Cgy7zc": fixture("youtube-watch"),
    });

    const result = await importVideo("https://youtube.com/shorts/9vdF9Cgy7zc?feature=share");

    expect(result.ok).toBe(true);
    expect(fetched(fetchSpy)).toEqual(["https://www.youtube.com/watch?v=9vdF9Cgy7zc"]);
    expect(prompt()).toContain("on YouTube");
    expect(prompt()).toContain("Soft Yeast Buns Recipe");
    expect(prompt()).toContain("- 1 cup warm milk");
  });

  // A livestream's description or transcript can run to hundreds of thousands
  // of characters, and every one of them is paid for.
  it("sends Claude no more than 20,000 characters of each text", async () => {
    serve({ [TIKTOK]: tiktokPage(`${"a".repeat(20_000)}TRUNCATED`) });

    await importVideo(TIKTOK);

    expect(prompt()).toContain("a".repeat(20_000));
    expect(prompt()).not.toContain("TRUNCATED");
  });

  // What Claude failing looks like is `extractRecipe`'s business; the video
  // importer's is to name the messages and pass the outcome through.
  it("hands Claude a message about videos for each way it can fail", async () => {
    serve({ [TIKTOK]: tiktokPage("Recipe in my bio! #pasta") });
    extractRecipe.mockResolvedValue(CLAUDE_FAILED);

    expect(await importVideo(TIKTOK)).toEqual(CLAUDE_FAILED);
    const messages = extractRecipe.mock.calls[0][1];
    expect(messages.unreachable).toMatch(/video/);
    expect(messages.unparseable).toMatch(/bio.*“Paste a recipe”/);
  });
});

describe("when the caption links to recipes", () => {
  // A creator's own recipe page is structured data they published — better
  // than anything read out of a caption, and free.
  it("takes the linked recipe the video names, without asking Claude", async () => {
    serve({
      [TIKTOK]: tiktokPage("My birthday cake! Recipe: https://blog.example/cake"),
      "https://blog.example/cake": fixture("king-arthur"),
    });

    const result = await importVideo(TIKTOK);

    expect(result).toMatchObject({ ok: true, value: { title: "Classic Birthday Cake" } });
    expect(extractRecipe).not.toHaveBeenCalled();
  });

  // The case the name check exists for: order in the caption decides nothing.
  it("passes over a linked recipe for another dish, even when it's first", async () => {
    serve({
      [TIKTOK]: tiktokPage(
        "Chocolate cake! More from me: https://a.example/lasagna Recipe: https://b.example/cake",
      ),
      "https://a.example/lasagna": recipePage("Weeknight Lasagna"),
      "https://b.example/cake": recipePage("Chocolate Cake"),
    });

    const result = await importVideo(TIKTOK);

    expect(result).toMatchObject({ ok: true, value: { title: "Chocolate Cake" } });
    expect(extractRecipe).not.toHaveBeenCalled();
  });

  it("finds the dish's name in the transcript as well as the caption", async () => {
    serve({
      [TIKTOK]: tiktokPage("Recipe: https://b.example/cake", "https://cdn.example/t.vtt"),
      "https://cdn.example/t.vtt": "WEBVTT\n\n00:00.000 --> 00:02.000\nThis chocolate cake is so good",
      "https://b.example/cake": recipePage("Chocolate Cake"),
    });

    expect(await importVideo(TIKTOK)).toMatchObject({
      ok: true,
      value: { title: "Chocolate Cake" },
    });
  });

  // What the video itself says beats a link to something else.
  it("reads the video when no linked recipe is the one it names", async () => {
    serve({
      [TIKTOK]: tiktokPage("Baked feta pasta! More: https://a.example/lasagna"),
      "https://a.example/lasagna": recipePage("Weeknight Lasagna"),
    });

    expect(await importVideo(TIKTOK)).toEqual({ ok: true, value: fromClaude });
  });

  it("reads the video when the linked page has no recipe", async () => {
    serve({
      [TIKTOK]: tiktokPage("Recipe: https://blog.example/cake 1 cup flour"),
      "https://blog.example/cake": "<html><body>A blog post</body></html>",
    });

    expect(await importVideo(TIKTOK)).toEqual({ ok: true, value: fromClaude });
  });

  // "You NEED to try this 😍" and one link: nothing in the video says
  // otherwise, and the creator linked it from here.
  it("takes the only linked recipe when the video itself holds none", async () => {
    serve({
      [TIKTOK]: tiktokPage("You NEED to try this 😍 https://a.example/lasagna"),
      "https://a.example/lasagna": recipePage("Weeknight Lasagna"),
    });
    extractRecipe.mockResolvedValue(NOTHING_FOUND);

    expect(await importVideo(TIKTOK)).toMatchObject({
      ok: true,
      value: { title: "Weeknight Lasagna" },
    });
  });

  it("won't guess between several linked recipes when the video names none", async () => {
    serve({
      [TIKTOK]: tiktokPage("You NEED to try these https://a.example/lasagna https://b.example/cake"),
      "https://a.example/lasagna": recipePage("Weeknight Lasagna"),
      "https://b.example/cake": recipePage("Chocolate Cake"),
    });
    extractRecipe.mockResolvedValue(NOTHING_FOUND);

    const result = await importVideo(TIKTOK);

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "unparseable", message: /more than one recipe.*paste its link here/ },
    });
  });

  // Claude being down says nothing about whether the video holds a recipe,
  // so it's no reason to fall back to a link.
  it("reports Claude failing rather than falling back to the link", async () => {
    serve({
      [TIKTOK]: tiktokPage("You NEED to try this 😍 https://a.example/lasagna"),
      "https://a.example/lasagna": recipePage("Weeknight Lasagna"),
    });
    extractRecipe.mockResolvedValue(CLAUDE_FAILED);

    expect(await importVideo(TIKTOK)).toEqual(CLAUDE_FAILED);
  });

  it("says so when the video holds no recipe and links none", async () => {
    serve({ [TIKTOK]: tiktokPage("Recipe in my bio! https://blog.example/about") });
    extractRecipe.mockResolvedValue(NOTHING_FOUND);

    expect(await importVideo(TIKTOK)).toEqual(NOTHING_FOUND);
  });
});

describe("what it won't read", () => {
  // The transcript's address comes out of TikTok's page, not from the user —
  // it gets the same vetting as anything else our server is asked to fetch.
  it("never fetches a transcript that points somewhere private", async () => {
    const fetchSpy = serve({
      [TIKTOK]: tiktokPage("Soup: 1 onion", "http://169.254.169.254/latest/meta-data/"),
    });

    expect((await importVideo(TIKTOK)).ok).toBe(true);
    expect(fetched(fetchSpy)).toEqual([TIKTOK]);
  });

  it("never follows a caption link that points somewhere private", async () => {
    const fetchSpy = serve({
      [TIKTOK]: tiktokPage("Recipe: http://127.0.0.1:8000/admin"),
    });

    await importVideo(TIKTOK);
    expect(fetched(fetchSpy)).toEqual([TIKTOK]);
  });

  it("refuses Instagram without fetching, and points at pasting", async () => {
    const fetchSpy = serve({});

    const result = await importVideo("https://www.instagram.com/reel/C_CXETzxJc3/");

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "unreachable", message: /“Paste a recipe”/ },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("passes on a video page that refuses us", async () => {
    serve({ [TIKTOK]: new Response("nope", { status: 403 }) });

    const result = await importVideo(TIKTOK);

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "unreachable", message: /“Paste a recipe”/ },
    });
    expect(extractRecipe).not.toHaveBeenCalled();
  });

  it("says so when the video's page doesn't carry its data", async () => {
    serve({ [TIKTOK]: "<html><body>Log in to TikTok</body></html>" });

    const result = await importVideo(TIKTOK);

    expect(result).toMatchObject({ ok: false, error: { kind: "unparseable" } });
    expect(extractRecipe).not.toHaveBeenCalled();
  });

  it("doesn't ask Claude about a video with nothing written or said", async () => {
    serve({ [TIKTOK]: tiktokPage("  ") });

    const result = await importVideo(TIKTOK);

    expect(result).toMatchObject({ ok: false, error: { kind: "unparseable" } });
    expect(extractRecipe).not.toHaveBeenCalled();
  });
});
