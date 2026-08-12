import type { ComponentProps } from "react";
import type { ClerkProvider } from "@clerk/nextjs";

// `@clerk/types` isn't a direct dependency and the SDK doesn't re-export an
// `Appearance` type by name, so derive it from the prop it's actually passed
// to. This stays correct if the shape changes in a future version, and keeps
// excess-property checking on the object below — a mistyped element key is a
// compile error rather than a silently ignored no-op.
type Appearance = NonNullable<
  ComponentProps<typeof ClerkProvider>["appearance"]
>;

/**
 * Appearance for every Clerk-rendered surface — the profile dropdown, and the
 * sign-in / sign-up pages, which were otherwise stock Clerk.
 *
 * ## Why some values are `var()` and some are literal hexes
 *
 * Clerk's colour variables come in two kinds:
 *
 *  - `CssColor` (`colorBackground`, `colorForeground`, `colorBorder`, …) is
 *    passed through as a raw CSS value, so it can be `var(--token)` and track
 *    the app's tokens directly.
 *
 *  - `CssColorOrScale` / `CssColorOrAlphaScale` (`colorPrimary`, `colorDanger`,
 *    `colorNeutral`) are *parsed* so Clerk can derive shades and alpha variants.
 *    A `var()` can't be parsed at config time, so these must be literal colours
 *    — the only place in the app where a token value is duplicated by hand.
 *
 * This used to be a function of `isDark`, subscribed to `prefers-color-scheme`
 * by a client component, because `colorNeutral` cannot be a variable and had to
 * be flipped per scheme. The app is light-only now, so it's a constant.
 */
export const clerkAppearance: Appearance = {
  variables: {
    // ---- Parsed colours: must be literal ---------------------------------
    // Drives text, borders, hover fills and dropdown option states.
    colorNeutral: "black",
    // Literal copies of --accent / --on-accent / --error. If the palette in
    // theme.css is swapped, these three lines must be updated to match.
    colorPrimary: "#dd423e",
    colorPrimaryForeground: "#ffffff",
    colorDanger: "#9c2723",
    colorShadow: "#000000",

    // ---- Raw CSS values: can point at the app's own tokens ---------------
    colorBackground: "var(--background)",
    colorForeground: "var(--foreground)",
    colorMuted: "var(--background-control)",
    // Text/Tertiary rather than Text/Muted: Clerk uses this for secondary
    // labels, and the muted step (Dusty Bronze, 2.6:1) is too light to read
    // there.
    colorMutedForeground: "var(--foreground-tertiary)",
    colorInput: "var(--background-control)",
    colorInputForeground: "var(--foreground)",
    colorBorder: "var(--border-default)",

    // Literal, not var(--corner-sm): Clerk derives its sm/md/lg radii from
    // this value, which means it has to be parseable at config time. Kept in
    // sync with the token by hand.
    borderRadius: "0.5rem",
    // Inherit the app's own font rather than Clerk's default stack.
    fontFamily: "var(--font-sans-stack)",
  },
  elements: {
    // Dropdown shell.
    userButtonPopoverCard: "shadow-lg",
    userButtonPopoverFooter: "hidden",

    // Menu rows — Clerk's built-ins and our custom entries styled alike so
    // the two groups are indistinguishable.
    userButtonPopoverActionButton: "text-subheadline",
    userButtonPopoverCustomItemButton: "text-subheadline",

    // Avatar in the header.
    userButtonAvatarBox: "h-8 w-8",

    // Sign-in / sign-up pages.
    card: "shadow-lg",
    formButtonPrimary:
      "bg-accent hover:bg-accent-hover text-on-accent normal-case font-medium",
    // A sign-in/sign-up link, not a destructive one — accent, not error.
    footerActionLink: "text-accent-ink hover:underline",
  },
};
