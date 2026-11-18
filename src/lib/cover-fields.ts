import type { CoverDesign } from "@/lib/book-covers";

// A cover on its way to the server: the design, as the string fields the
// cookbook service takes. One list of names, shared by everything that sends
// a cover (the settings form's hidden inputs, the new-cookbook page's Server
// Action call) and everything that receives one (the two actions), so a field
// added to the cover is added in exactly one place.

export const COVER_FIELD_NAMES = [
  "coverImageUrl",
  "coverColor",
  "coverStyle",
  "coverTexture",
  "coverTitleFont",
  "coverTitleSize",
  "coverTitlePosition",
  "coverFocalX",
  "coverFocalY",
  "coverZoom",
  "coverElements",
] as const;
export type CoverFieldName = (typeof COVER_FIELD_NAMES)[number];

/**
 * A cover as string fields — the same names a form would post, whether they
 * travel as hidden inputs or as the argument of a Server Action.
 *
 * The style is carried as it stands, not re-derived from what is on the
 * cover. A cover that has been through the editor already has the right one;
 * a cover that hasn't may be an older one whose title is still on its plate,
 * and deriving "no title element, so PLAIN" for it would strip the title off
 * a cookbook whose owner only meant to change its description.
 */
export function coverFields(design: CoverDesign): Record<CoverFieldName, string> {
  return {
    coverImageUrl: design.coverImageUrl ?? "",
    coverColor: String(design.coverColor),
    coverStyle: design.coverStyle,
    coverTexture: design.coverTexture,
    coverTitleFont: design.coverTitleFont,
    coverTitleSize: design.coverTitleSize,
    coverTitlePosition: design.coverTitlePosition,
    coverFocalX: String(design.coverFocalX),
    coverFocalY: String(design.coverFocalY),
    coverZoom: String(design.coverZoom),
    coverElements: JSON.stringify(design.coverElements),
  };
}

/**
 * The cover fields out of a posted form, each as a string and empty when
 * absent — which the schema reads as "not said" rather than as an error.
 */
export function coverFieldsFrom(formData: FormData): Record<CoverFieldName, string> {
  const fields = {} as Record<CoverFieldName, string>;
  for (const name of COVER_FIELD_NAMES) fields[name] = String(formData.get(name) ?? "");
  return fields;
}
