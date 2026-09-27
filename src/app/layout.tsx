import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerk-appearance";
import SiteHeader from "@/components/site-header";
import { fontVariables } from "./fonts";
import "./globals.css";

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
        className={`${fontVariables} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">
          <SiteHeader />
          <main className="flex-1">{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}
