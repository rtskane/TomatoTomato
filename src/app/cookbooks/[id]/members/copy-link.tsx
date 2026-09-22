"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

// Copying a join link, shared by the cookbook's own link and its one-time
// links. Everything that knows about the clipboard, and about what to do when
// the clipboard says no, lives here once.

const noSubscription = () => () => {};

/**
 * A join link's full URL on the host the owner is actually using. The server
 * can't know that host (preview, production, localhost), so it's read in the
 * browser: the server snapshot is empty, and React swaps in the real origin
 * after hydration without a mismatch. Empty until then, or for no token.
 */
export function useJoinUrl(token: string | null): string {
  const origin = useSyncExternalStore(
    noSubscription,
    () => window.location.origin,
    () => "",
  );
  return token && origin ? `${origin}/join/${token}` : "";
}

/**
 * Copy `text`, reporting "copied" for two seconds. `failed` turns true when
 * the clipboard refuses — no permission, or an insecure origin — so the caller
 * can put the text somewhere it can be copied by hand.
 */
function useCopy(text: string) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    // Reset first, so a second refusal is a fresh change the caller can react to.
    setFailed(false);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
    }
  }

  return { copied, failed, copy };
}

/** The cookbook's link, shown in full with a Copy button beside it. */
export function CopyLinkField({ url, label }: { url: string; label: string }) {
  const { copied, failed, copy } = useCopy(url);
  const fieldRef = useRef<HTMLInputElement>(null);

  // The link is already on screen, so a refused clipboard only has to hand
  // the person the field to copy from themselves. Focus is a DOM side effect,
  // so it waits for the commit.
  useEffect(() => {
    if (failed) fieldRef.current?.focus();
  }, [failed]);

  return (
    <>
      <div className="flex gap-2">
        <input
          ref={fieldRef}
          readOnly
          value={url}
          aria-label={label}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-lg border border-border bg-background-control px-3 py-1.5 text-caption-1 text-foreground-secondary outline-none focus:border-border-input-strong"
        />
        <button
          type="button"
          onClick={copy}
          disabled={!url}
          className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-subheadline font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      <CopiedStatus copied={copied} />
    </>
  );
}

/**
 * A Copy button on its own, for a row that doesn't show its link. If the
 * clipboard refuses, the link appears under it, selected, to copy by hand.
 */
export function CopyLinkButton({ url, label }: { url: string; label: string }) {
  const { copied, failed, copy } = useCopy(url);

  return (
    <>
      <button
        type="button"
        onClick={copy}
        disabled={!url}
        aria-label={`Copy ${label}`}
        className="rounded-md border border-border px-2.5 py-1 text-caption-1 font-medium text-foreground-secondary hover:bg-background-secondary disabled:opacity-50"
      >
        {copied ? "Copied" : "Copy link"}
      </button>
      {failed ? (
        <input
          readOnly
          autoFocus
          value={url}
          aria-label={label}
          onFocus={(e) => e.currentTarget.select()}
          className="mt-1 w-full rounded-md border border-border bg-background-control px-2 py-1 text-caption-2 text-foreground-secondary outline-none"
        />
      ) : null}
      <CopiedStatus copied={copied} />
    </>
  );
}

/**
 * Announced separately: a button's own text changing isn't reliably read out
 * while focus stays on it.
 */
function CopiedStatus({ copied }: { copied: boolean }) {
  return (
    <p role="status" className="sr-only">
      {copied ? "Link copied" : ""}
    </p>
  );
}
