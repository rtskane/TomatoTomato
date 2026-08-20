"use client";

import { useId, useRef, useState } from "react";
import Image from "next/image";
import { upload } from "@vercel/blob/client";

/**
 * Pick a cover image for a cookbook.
 *
 * Controlled: the parent form owns the URL, because the parent is what has to
 * put it in a hidden field and what has to stop its own submit button while an
 * upload is still in flight. A cookbook saved mid-upload would silently lose
 * the picture the user just chose.
 *
 * The file goes browser → blob store directly and never through our server;
 * `/api/cookbooks/cover` only issues the token that allows it. What comes back
 * is a URL, and that URL is re-validated server-side before it is stored — see
 * `coverImageUrlSchema`.
 */

/** Kept in step with the route handler, which enforces both for real. */
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * How long to let an upload run before calling it failed.
 *
 * Without this the field can spin forever: the SDK retries a 5xx from the blob
 * API with backoff, and some server-side misconfigurations (a private store
 * asked for public access, say) surface as exactly that. The user sees
 * "Uploading… 0%" and no error, which is the worst of both — nothing happened
 * and nothing said so. Generous enough for 8 MB on a bad connection, and the
 * percentage is ticking the whole time on a healthy one.
 */
const TIMEOUT_MS = 90_000;
const ACCEPTED = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
];

/**
 * The uploaded file keeps its name so the store is browsable, but only the
 * parts of it that are safe in a URL path. The store adds a random suffix, so
 * two "cover.jpg" uploads still can't collide.
 */
function safePathname(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-64);

  return `cookbook-covers/${cleaned || "cover"}`;
}

export default function CoverImageField({
  value,
  onChange,
  onUploadingChange,
}: {
  value: string;
  onChange: (url: string) => void;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [percentage, setPercentage] = useState(0);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const errorId = useId();

  function setBusy(busy: boolean) {
    setUploading(busy);
    onUploadingChange?.(busy);
  }

  async function handleFile(file: File) {
    setError(null);

    // Checked here for a fast, clear message, and again in the token the
    // server issues — this one is a courtesy, that one is the rule.
    if (!ACCEPTED.includes(file.type)) {
      setError("Choose a JPEG, PNG, WebP, AVIF or GIF.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("That image is larger than 8 MB.");
      return;
    }

    setBusy(true);
    setPercentage(0);

    try {
      const blob = await upload(safePathname(file.name), file, {
        access: "public",
        handleUploadUrl: "/api/cookbooks/cover",
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
        onUploadProgress: (progress) => setPercentage(progress.percentage),
      });
      onChange(blob.url);
    } catch (cause) {
      // The API's own messages are about tokens and stores, which means
      // nothing to someone choosing a photo. A timeout gets its own wording
      // because "try again" is bad advice when the last attempt hung.
      const timedOut = cause instanceof Error && cause.name === "TimeoutError";
      setError(
        timedOut
          ? "That upload timed out. Check your connection and try again."
          : "That didn't upload. Try again?",
      );
      // Whatever it was, it is worth having in the console: the friendly text
      // above is deliberately uninformative to anyone debugging.
      console.error("[cover] upload failed", cause);
    } finally {
      setBusy(false);
      // Let the same file be chosen again after a failure — without this the
      // input holds it and the change event never fires twice.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <span className="block text-subheadline font-medium">
        Cover{" "}
        <span className="font-normal text-foreground-tertiary">(optional)</span>
      </span>

      <div className="mt-2 flex items-start gap-4">
        {/* The preview doubles as the empty state, so the row doesn't reflow
            when a picture arrives. */}
        <div className="relative aspect-3/4 w-24 shrink-0 overflow-hidden rounded-md border border-border bg-background-control">
          {value ? (
            <Image
              src={value}
              alt=""
              fill
              sizes="96px"
              className="object-cover"
            />
          ) : (
            <span className="flex h-full items-center justify-center text-caption-2 text-foreground-muted">
              No cover
            </span>
          )}
        </div>

        <div className="min-w-0">
          <label
            htmlFor={inputId}
            className="inline-block cursor-pointer rounded-md border border-border-strong px-3 py-1.5 text-subheadline font-medium hover:bg-background-secondary"
          >
            {value ? "Replace image" : "Choose image"}
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ACCEPTED.join(",")}
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
            aria-describedby={error ? errorId : undefined}
            className="sr-only"
          />

          {value ? (
            <button
              type="button"
              onClick={() => {
                onChange("");
                setError(null);
              }}
              disabled={uploading}
              className="ml-2 rounded-md px-2 py-1.5 text-subheadline text-foreground-secondary hover:underline disabled:opacity-60"
            >
              Remove
            </button>
          ) : null}

          {uploading ? (
            <p
              role="status"
              className="mt-2 text-caption-1 text-foreground-secondary"
            >
              Uploading… {Math.round(percentage)}%
            </p>
          ) : (
            <p className="mt-2 text-caption-1 text-foreground-tertiary">
              JPEG, PNG, WebP, AVIF or GIF, up to 8 MB.
            </p>
          )}

          {error ? (
            <p
              id={errorId}
              role="alert"
              className="mt-2 text-caption-1 text-error"
            >
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
