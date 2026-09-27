"use client";

import ErrorPage from "./error";
import { fontVariables } from "./fonts";
import "./globals.css";

// Replaces the root layout when the layout itself throws — so it brings its own
// <html>, <body>, stylesheet and fonts, and goes without the header.

export default function GlobalError(props: Parameters<typeof ErrorPage>[0]) {
  return (
    <html lang="en" className={`${fontVariables} h-full antialiased`}>
      <body>
        <ErrorPage {...props} />
      </body>
    </html>
  );
}
