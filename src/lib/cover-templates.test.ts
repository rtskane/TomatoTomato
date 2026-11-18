import { describe, it, expect } from "vitest";
import { COVER_COUNT } from "./book-covers";
import { createCookbookSchema } from "./cookbook";
import { styleFor } from "./cover-editing";
import { coverFields } from "./cover-fields";
import { colorCss, inkFor, titleElement } from "./cover-elements";
import { coverElementsSchema } from "./cover-elements-schema";
import { COVER_TEMPLATES, FEATURED_TEMPLATES, blankDesign, templateDesign } from "./cover-templates";

const colors = Array.from({ length: COVER_COUNT }, (_, i) => i + 1);

describe("the ready-made covers", () => {
  it("are told apart by id and by name", () => {
    expect(new Set(COVER_TEMPLATES.map((t) => t.id)).size).toBe(COVER_TEMPLATES.length);
    expect(new Set(COVER_TEMPLATES.map((t) => t.name)).size).toBe(COVER_TEMPLATES.length);
  });

  // A template is not a second kind of cover: it has to be something the
  // editor could have produced and the server will store.
  it.each(COVER_TEMPLATES.map((t) => [t.name, t] as const))(
    "%s is a cover the server accepts",
    (_name, template) => {
      const design = templateDesign(template);
      const parsed = coverElementsSchema.safeParse(design.coverElements);
      expect(parsed.success).toBe(true);
      // Nothing clamped, dropped or defaulted on the way through: what the
      // picker draws is what gets stored.
      expect(parsed.data).toEqual(design.coverElements);

      const created = createCookbookSchema.safeParse({
        title: "Weeknight Dinners",
        description: "",
        ...coverFields(design),
      });
      expect(created.success).toBe(true);
    },
  );

  it.each(COVER_TEMPLATES.map((t) => [t.name, t] as const))(
    "%s shows the cookbook's name, once",
    (_name, template) => {
      const design = templateDesign(template);
      expect(design.coverElements.filter((e) => e.type === "text" && e.role === "title")).toHaveLength(1);
      // …which is what its stored style has to say, for a client that can't
      // draw elements.
      expect(design.coverStyle).toBe("TITLED");
      expect(styleFor(design)).toBe("TITLED");
    },
  );

  // The reason a template lays itself out for a cloth rather than naming
  // colours outright: the name has to read on whichever cloth it is given. It reads when it is the cloth's own
  // ink, or when it is printed on a label of that ink.
  it.each(COVER_TEMPLATES.map((t) => [t.name, t] as const))(
    "%s keeps its name legible on every cloth",
    (_name, template) => {
      for (const color of colors) {
        const elements = template.elements(color);
        const title = titleElement(elements)!;
        const ink = inkFor(color);
        const behind = elements
          .slice(0, elements.indexOf(title))
          .filter((e) => e.type === "shape" && !e.outline && e.shape === "rect");
        const label = behind.at(-1);
        if (label?.type === "shape") {
          expect(label.color).toBe(ink);
          expect(colorCss(title.color)).not.toBe(colorCss(label.color));
        } else {
          expect(title.color).toBe(ink);
        }
      }
    },
  );

  it("is drawn on its own cloth and weave", () => {
    for (const template of COVER_TEMPLATES) {
      expect(templateDesign(template)).toMatchObject({
        coverColor: template.color,
        coverTexture: template.texture,
        coverElements: template.elements(template.color),
      });
    }
  });
});

describe("the covers the new-cookbook page offers", () => {
  // A short row to choose from, not a catalogue.
  it("are a few of the templates", () => {
    expect(FEATURED_TEMPLATES.length).toBeGreaterThanOrEqual(3);
    expect(FEATURED_TEMPLATES.length).toBeLessThanOrEqual(4);
    for (const template of FEATURED_TEMPLATES) expect(COVER_TEMPLATES).toContain(template);
  });

  // "Different colours or patterns": no two on the same cloth, and both
  // weaves on show beside a plain one.
  it("differ in colour, and show each pattern", () => {
    expect(new Set(FEATURED_TEMPLATES.map((t) => t.color)).size).toBe(FEATURED_TEMPLATES.length);
    expect(new Set(FEATURED_TEMPLATES.map((t) => t.texture))).toEqual(
      new Set(["NONE", "GINGHAM", "GRID"]),
    );
  });
});

describe("a blank cover", () => {
  it("has only the name on it, in an ink that reads", () => {
    const design = blankDesign(8);
    expect(design.coverElements).toHaveLength(1);
    expect(titleElement(design.coverElements)?.color).toBe(inkFor(8));
    expect(coverElementsSchema.safeParse(design.coverElements).success).toBe(true);
  });
});
