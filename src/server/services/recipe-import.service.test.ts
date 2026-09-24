import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { fixture, htmlResponse } from "@/lib/__fixtures__/web";

const { findMembership, importFromVideo } = vi.hoisted(() => ({
  findMembership: vi.fn(),
  importFromVideo: vi.fn(),
}));
vi.mock("@/server/repositories/cookbook.repository", () => ({
  cookbookRepository: { findMembership },
}));
vi.mock("./recipe-video-import.service", () => ({ importFromVideo }));

import {
  importFromText as importFromTextAs,
  importFromUrl as importFromUrlAs,
} from "./recipe-import.service";

// Most tests here are about parsing and fetching, not permissions, so they
// import as a member who is allowed to — the permission tests say otherwise.
const importFromText = (text: string) => importFromTextAs("u1", "cb1", text);
const importFromUrl = (url: string) => importFromUrlAs("u1", "cb1", url);

beforeEach(() => {
  vi.clearAllMocks();
  findMembership.mockResolvedValue({ role: "EDITOR" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("who may import", () => {
  // Importing writes nothing, but the link importer makes our server fetch a
  // URL of the caller's choosing — so it is gated exactly like adding a recipe.
  it.each([
    ["a non-member", null],
    ["a viewer", { role: "VIEWER" }],
  ])("refuses %s, and never fetches for them", async (_who, membership) => {
    findMembership.mockResolvedValue(membership);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const fromUrl = await importFromUrlAs("u1", "cb1", "https://example.com/r");
    const fromText = await importFromTextAs("u1", "cb1", "Toast\nToast it.");

    expect(fromUrl).toMatchObject({ ok: false, error: { kind: "forbidden" } });
    expect(fromText).toMatchObject({ ok: false, error: { kind: "forbidden" } });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(findMembership).toHaveBeenCalledWith("cb1", "u1");
  });

  it.each(["OWNER", "EDITOR"])("lets an %s import", async (role) => {
    findMembership.mockResolvedValue({ role });
    expect((await importFromTextAs("u1", "cb1", "Toast\nToast it.")).ok).toBe(true);
  });
});

describe("importFromText", () => {
  it("turns a pasted recipe into form values", async () => {
    const result = await importFromText(
      [
        "Weeknight Carbonara",
        "Ingredients",
        "200 g spaghetti",
        "2 eggs",
        "Method",
        "Boil the pasta.",
        "Stir the eggs through off the heat.",
      ].join("\n"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe("Weeknight Carbonara");
    expect(result.value.ingredients).toHaveLength(2);
    expect(result.value.steps).toHaveLength(2);
  });

  it("refuses an empty paste", async () => {
    const result = await importFromText("   ");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("invalid");
  });

  it("says so when the paste has nothing recognisable in it", async () => {
    // Headings with nothing under them: no ingredients, no steps.
    const result = await importFromText("Ingredients\n\nMethod\n");
    expect(result).toMatchObject({ ok: false, error: { kind: "unparseable" } });
  });
});

// What reaching a page safely involves — private addresses, redirects, size
// limits, charsets — is `safe-fetch.test.ts`. These are about what the link
// importer does with it.
describe("importFromUrl", () => {
  it("refuses a private address without fetching it", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await importFromUrl("http://169.254.169.254/latest/meta-data/");

    expect(result).toMatchObject({ ok: false, error: { kind: "blocked" } });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("imports a real publisher's page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(htmlResponse(fixture("king-arthur"))),
    );

    const result = await importFromUrl("kingarthurbaking.com/recipes/cake");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe("Classic Birthday Cake");
    expect(result.value.ingredients).toHaveLength(16);
  });

  it("passes on why a page couldn't be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 402 })),
    );

    const result = await importFromUrl("https://www.allrecipes.com/recipe/1");
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "unreachable", message: /“Paste a recipe”/ },
    });
  });

  // Scraping the visible text of a recipe page yields navigation, comments and
  // advertising. Saying so beats handing someone a recipe they have to repair.
  it("says so rather than scraping a page with no structured data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(htmlResponse("<html><body>A blog post</body></html>")),
    );

    const result = await importFromUrl("https://example.com/post");
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "unparseable", message: /“Paste a recipe”/ },
    });
  });

  it("treats an empty response as a page with no recipe on it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    const result = await importFromUrl("https://example.com/recipe");
    expect(result).toMatchObject({ ok: false, error: { kind: "unparseable" } });
  });
});

describe("importFromUrl — videos", () => {
  const watchPage = new URL("https://www.youtube.com/watch?v=9vdF9Cgy7zc");

  it("hands a video link to the video importer, and passes on what it finds", async () => {
    const found = { ok: false, error: { kind: "unparseable", message: "none" } };
    importFromVideo.mockResolvedValue(found);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await importFromUrl("youtube.com/shorts/9vdF9Cgy7zc");

    expect(result).toBe(found);
    expect(importFromVideo).toHaveBeenCalledWith({ platform: "youtube", url: watchPage });
    // The page is the video importer's to fetch, not read as a recipe page.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // The video importer has no permission check of its own; it relies on this.
  it("checks permission before a video link is handed on", async () => {
    findMembership.mockResolvedValue({ role: "VIEWER" });

    const result = await importFromUrl("https://youtu.be/9vdF9Cgy7zc");

    expect(result).toMatchObject({ ok: false, error: { kind: "forbidden" } });
    expect(importFromVideo).not.toHaveBeenCalled();
  });
});
