import Link from "next/link";
import type { Metadata } from "next";

// Shown for any URL that matches nothing, and wherever a page calls
// `notFound()` — which includes cookbooks and recipes the viewer isn't allowed
// to see. So it never says which of those it was: "deleted", "wrong link" and
// "not yours" all read the same from here.
//
// The title is set twice on purpose. `metadata` is what reaches the tab for an
// unmatched URL, where the layout's own title is written ahead of any <title>
// element; but when a page's `notFound()` sends someone here, `metadata` is
// ignored and only the <title> element gets through.

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <title>Page not found</title>
      <h1 className="text-title-2">We couldn&rsquo;t find that page</h1>
      <p className="mt-3 text-foreground-secondary">
        It may have been deleted, or the link may be wrong.
      </p>
      {/* `/` sends anyone signed in on to their library. */}
      <Link
        href="/"
        className="mt-8 inline-block text-subheadline font-medium underline hover:no-underline"
      >
        Back to Tomato Tomato
      </Link>
    </div>
  );
}
