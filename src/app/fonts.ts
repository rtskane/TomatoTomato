import { Geist_Mono, Inter, Source_Serif_4 } from "next/font/google";

// The three typefaces are bound to role-named CSS variables (--font-*-src),
// never to variables named after the font itself. theme.css builds its stacks
// on those roles, so changing a typeface is a one-line edit here — no other
// file mentions a font by name.
//
// Its own module because two files put these on <html>: the root layout, and
// `global-error`, which replaces the layout when it fails. Without the
// variables, theme.css's stacks are invalid as a whole — not just missing their
// first entry — and the page falls back to the browser's default serif.

// UI typeface, per the Theme Figma file. Variable font, so the full 100–900
// range the type scale asks for comes down in one file.
const sans = Inter({
  variable: "--font-sans-src",
  subsets: ["latin"],
});

const mono = Geist_Mono({
  variable: "--font-mono-src",
  subsets: ["latin"],
});

// Editorial serif, used for recipe titles and body copy. Cookbooks and food
// publications set recipes in serif for a reason: it reads as something to be
// read and followed, not as UI chrome. The Figma file doesn't cover it.
const serif = Source_Serif_4({
  variable: "--font-serif-src",
  subsets: ["latin"],
});

/** The classes that define the --font-*-src variables, for <html>. */
export const fontVariables = `${sans.variable} ${mono.variable} ${serif.variable}`;
