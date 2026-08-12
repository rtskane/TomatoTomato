import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter, Source_Serif_4 } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerk-appearance";
import SiteHeader from "@/components/site-header";
import "./globals.css";

// The three typefaces are bound to role-named CSS variables (--font-*-src),
// never to variables named after the font itself. theme.css builds its stacks
// on those roles, so changing a typeface is a one-line edit here — no other
// file mentions a font by name.

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

export const metadata: Metadata = {
  title: "Tomato Tomato",
  description: "A collaborative cookbook you build with friends.",
};

// The Figma theme defines a light design only, so say so explicitly. Without
// this, a visitor whose OS is set to dark gets dark-rendered scrollbars, form
// controls, spinners and caret colours over the white page. It lives here
// rather than as `color-scheme` in globals.css because Tailwind's build strips
// that declaration out of the stylesheet.
export const viewport: Viewport = {
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider appearance={clerkAppearance}>
      <html
        lang="en"
        className={`${sans.variable} ${mono.variable} ${serif.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">
          <SiteHeader />
          <main className="flex-1">{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}
