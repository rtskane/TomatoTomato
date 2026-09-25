"use client";

import ErrorPage from "./error";
import "./globals.css";

// Replaces the root layout when the layout itself throws — so it brings its own
// <html>, <body> and stylesheet, and can't rely on the header or fonts the
// layout would have set up. The typefaces fall back to theme.css's system
// stacks, which is fine for a page nobody should see.

export default function GlobalError(props: Parameters<typeof ErrorPage>[0]) {
  return (
    <html lang="en">
      <body>
        <ErrorPage {...props} />
      </body>
    </html>
  );
}
