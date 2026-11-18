import { describe, it, expect } from "vitest";
import { EMPTY_DRAFT, isEmptyDraft, parseDraft, type CookbookDraft } from "./cookbook-draft";
import { blankDesign } from "./cover-templates";

const draft = (overrides: Partial<CookbookDraft> = {}): CookbookDraft => ({
  ...EMPTY_DRAFT,
  title: "Weeknight Dinners",
  templateId: "classic",
  ...overrides,
});

describe("parseDraft", () => {
  it("gives back what was stored", () => {
    const stored = draft({ custom: blankDesign(2) });
    expect(parseDraft(JSON.stringify(stored))).toEqual(stored);
  });

  it("has nothing to restore when nothing was stored", () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft("")).toBeNull();
  });

  // Storage is the person's own, but it can still hold anything: an older
  // shape, a hand edit, half a write. None of it may crash the page.
  it.each(["{", "null", "42", '"text"', "[]"])("ignores %s", (raw) => {
    expect(parseDraft(raw)).toBeNull();
  });

  it("drops the parts it can't use and keeps the rest", () => {
    const parsed = parseDraft(
      JSON.stringify({ title: "Soups", templateId: 7, custom: { coverColor: "red" } }),
    );
    expect(parsed).toEqual({ title: "Soups", templateId: null, custom: null });
  });

  it("won't restore a design whose elements aren't elements", () => {
    const custom = { ...blankDesign(2), coverElements: ["nope"] };
    expect(parseDraft(JSON.stringify({ ...draft(), custom }))?.custom).toBeNull();
  });

  // The one way a restored draft can crash the page: the image component
  // refuses a URL from a host it doesn't know. A draft that throws on every
  // visit could never be got rid of, so such a design isn't restored.
  describe("pictures from somewhere else", () => {
    const OURS = "https://abc123.public.blob.vercel-storage.com/cookbook-covers/a.jpg";
    const photo = (url: string) => ({
      id: "p1",
      type: "photo",
      x: 0.5,
      y: 0.5,
      w: 0.4,
      h: 0.3,
      rotation: 0,
      url,
      mask: "rect",
    });
    const withPhoto = (url: string) =>
      JSON.stringify({ ...draft(), custom: { ...blankDesign(2), coverElements: [photo(url)] } });

    it("restores a design whose placed photo is one of ours", () => {
      expect(parseDraft(withPhoto(OURS))?.custom).not.toBeNull();
    });

    it("won't restore a design with a placed photo from another host", () => {
      expect(parseDraft(withPhoto("https://evil.example.com/x.jpg"))?.custom).toBeNull();
    });

    it("won't restore a design with a background photo from another host", () => {
      const custom = { ...blankDesign(2), coverImageUrl: "https://evil.example.com/x.jpg" };
      expect(parseDraft(JSON.stringify({ ...draft(), custom }))?.custom).toBeNull();
      expect(
        parseDraft(JSON.stringify({ ...draft(), custom: { ...custom, coverImageUrl: OURS } }))
          ?.custom,
      ).not.toBeNull();
    });
  });

  it("cuts a name back to the longest a cookbook can have", () => {
    expect(parseDraft(JSON.stringify(draft({ title: "x".repeat(200) })))?.title).toHaveLength(80);
  });

  it("treats a draft with nothing in it as no draft", () => {
    expect(parseDraft(JSON.stringify(EMPTY_DRAFT))).toBeNull();
  });
});

describe("isEmptyDraft", () => {
  it("is empty until something is typed or chosen", () => {
    expect(isEmptyDraft(EMPTY_DRAFT)).toBe(true);
    expect(isEmptyDraft({ ...EMPTY_DRAFT, title: "   " })).toBe(true);
    expect(isEmptyDraft({ ...EMPTY_DRAFT, title: "Soups" })).toBe(false);
    expect(isEmptyDraft({ ...EMPTY_DRAFT, templateId: "picnic" })).toBe(false);
    expect(isEmptyDraft({ ...EMPTY_DRAFT, custom: blankDesign(1) })).toBe(false);
  });
});
