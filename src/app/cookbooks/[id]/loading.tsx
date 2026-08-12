// Streamed instantly while the page's server render waits on Clerk + Postgres.
// Without this there is no Suspense boundary, so Next holds the previous page
// on screen until the whole render finishes — the click appears to do nothing.
//
// The skeleton deliberately mirrors the real layout (back link, title block,
// card grid) so the swap is a fill-in rather than a jump.
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse px-4 py-10">
      <div className="h-4 w-28 rounded bg-background-tertiary" />

      <div className="mt-4 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="h-8 w-2/3 rounded bg-background-tertiary" />
          <div className="mt-3 h-4 w-1/2 rounded bg-background-secondary" />
        </div>
        <div className="h-9 w-28 shrink-0 rounded-md bg-background-tertiary" />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-border p-4"
          >
            <div className="h-5 w-1/2 rounded bg-background-tertiary" />
            <div className="mt-2 h-4 w-3/4 rounded bg-background-secondary" />
            <div className="mt-3 h-3 w-2/3 rounded bg-background-secondary" />
          </div>
        ))}
      </div>
    </div>
  );
}
