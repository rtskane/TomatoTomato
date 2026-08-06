import type { ComponentProps } from "react";
import type { ClerkProvider } from "@clerk/nextjs";

// `@clerk/types` isn't a direct dependency and the SDK doesn't re-export an
// `Appearance` type by name, so derive it from the prop it's actually passed
// to. This stays correct if the shape changes in a future version, and keeps
// excess-property checking on the object below — a mistyped element key is a
// compile error rather than a silently ignored no-op.
type Appearance = NonNullable<ComponentProps<typeof ClerkProvider>["appearance"]>;

/**
 * Appearance for every Clerk-rendered surface — the profile dropdown, and the
 * sign-in / sign-up pages, which were otherwise stock Clerk.
 *
 * ## Why this is a function of `isDark` rather than a constant
 *
 * Clerk's colour variables come in two kinds, and the difference decides how
 * each one can follow the app's theme:
 *
 *  - `CssColor` (`colorBackground`, `colorForeground`, `colorBorder`, …) is
 *    passed through as a raw CSS value. These can be `var(--token)`, so they
 *    flip automatically with the `prefers-color-scheme` block in globals.css.
 *
 *  - `CssColorOrScale` / `CssColorOrAlphaScale` (`colorPrimary`, `colorDanger`,
 *    `colorNeutral`) are *parsed* so Clerk can derive shades and alpha variants.
 *    A `var()` can't be parsed at config time, so these must be literal colours.
 *
 * `colorNeutral` is the one that forces the split. Its own docs say: "light
 * themes should be using dark shades ('black'), while dark themes should be
 * using light shades ('white')", and it drives text, borders and hover states.
 * Left at its default of 'black', the dropdown renders black text on a dark
 * background in dark mode — unreadable. It cannot be a CSS variable, so the
 * whole config has to be chosen per scheme instead.
 */
export function buildClerkAppearance(isDark: boolean): Appearance {
  return {
    variables: {
      // ---- Parsed colours: must be literal, so they vary by scheme ----------
      // Drives text, borders, hover fills and dropdown option states.
      colorNeutral: isDark ? "white" : "black",
      colorPrimary: "#dc2626", // red-600, the app's accent — legible on both
      colorPrimaryForeground: "#ffffff",
      colorDanger: "#dc2626",
      // Shadows read as muddy grey over a dark surface unless they're black.
      colorShadow: "#000000",

      // ---- Raw CSS values: can point at the app's own tokens ---------------
      colorBackground: "var(--background)",
      colorForeground: "var(--foreground)",
      colorMuted: "var(--surface-muted)",
      colorMutedForeground: "var(--muted-foreground)",
      colorInput: "var(--surface-muted)",
      colorInputForeground: "var(--foreground)",
      colorBorder: "var(--border-color)",

      borderRadius: "0.5rem",
      // Inherit the app's own font rather than Clerk's default stack.
      fontFamily: "var(--font-geist-sans)",
    },
    elements: {
      // Dropdown shell.
      userButtonPopoverCard: "shadow-lg",
      userButtonPopoverFooter: "hidden",

      // Menu rows — Clerk's built-ins and our custom entries styled alike so
      // the two groups are indistinguishable.
      userButtonPopoverActionButton: "text-sm",
      userButtonPopoverCustomItemButton: "text-sm",

      // Avatar in the header.
      userButtonAvatarBox: "h-8 w-8",

      // Sign-in / sign-up pages.
      card: "shadow-lg",
      formButtonPrimary:
        "bg-red-600 hover:bg-red-700 text-white normal-case font-medium",
      footerActionLink: "text-red-600 hover:text-red-700",
    },
  };
}
