import type { Metadata } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import ClerkProviderThemed from "@/components/clerk-provider-themed";
import SiteHeader from "@/components/site-header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Editorial serif, used for recipe titles and body copy. Cookbooks and food
// publications set recipes in serif for a reason: it reads as something to be
// read and followed, not as UI chrome.
const sourceSerif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tomato Tomato",
  description: "A collaborative cookbook you build with friends.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProviderThemed>
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">
          <SiteHeader />
          <main className="flex-1">{children}</main>
        </body>
      </html>
    </ClerkProviderThemed>
  );
}
