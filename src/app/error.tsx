"use client";

import Link from "next/link";

// Shown in place of any page that throws while rendering. The header stays, so
// the rest of the app is still a click away; `global-error.tsx` reuses this for
// when the root layout itself is what failed.

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <title>Something went wrong</title>
      <h1 className="text-title-2">Something went wrong</h1>
      <p className="mt-3 text-foreground-secondary">
        This page didn&rsquo;t load. Trying again often fixes it.
      </p>
      <div className="mt-8 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="rounded-md bg-accent px-4 py-2 text-subheadline font-medium text-on-accent hover:bg-accent-hover"
        >
          Try again
        </button>
        <Link
          href="/"
          className="text-subheadline font-medium underline hover:no-underline"
        >
          Back to Tomato Tomato
        </Link>
      </div>
      {/* In production a server error's message is withheld from the browser;
          this is what matches it to the server's log. */}
      {error.digest ? (
        <p className="mt-8 text-caption-1 text-foreground-tertiary">
          Reference: {error.digest}
        </p>
      ) : null}
    </div>
  );
}
