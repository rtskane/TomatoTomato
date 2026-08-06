// Streamed instantly while the recipe page waits on Clerk + Postgres.
// Mirrors RecipeArticle (back link, masthead, stats strip, two columns) so the
// swap is a fill-in rather than a jump.

export default function Loading() {
  return (
    <>
      <div className="mx-auto max-w-3xl animate-pulse px-4 pt-8">
        <div className="h-4 w-36 rounded bg-black/10 dark:bg-white/10" />
      </div>

      <article className="mx-auto max-w-3xl animate-pulse px-4 py-10">
        <header>
          <div className="h-12 w-4/5 rounded bg-black/10 dark:bg-white/10 sm:h-14" />
          <div className="mt-4 h-4 w-28 rounded bg-black/[0.07] dark:bg-white/[0.07]" />
          <div className="mt-5 space-y-2">
            <div className="h-5 w-full rounded bg-black/[0.07] dark:bg-white/[0.07]" />
            <div className="h-5 w-2/3 rounded bg-black/[0.07] dark:bg-white/[0.07]" />
          </div>
        </header>

        <div className="mt-8 flex flex-wrap gap-x-10 gap-y-4 border-y border-black/10 py-5 dark:border-white/15">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-12 rounded bg-black/[0.05] dark:bg-white/[0.05]" />
              <div className="h-4 w-16 rounded bg-black/10 dark:bg-white/10" />
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] lg:gap-14">
          <section className="space-y-3">
            <div className="h-6 w-28 rounded bg-black/10 dark:bg-white/10" />
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-4 rounded bg-black/[0.07] dark:bg-white/[0.07]"
                style={{ width: `${70 + ((i * 13) % 30)}%` }}
              />
            ))}
          </section>

          <section className="space-y-6">
            <div className="h-6 w-24 rounded bg-black/10 dark:bg-white/10" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-4">
                <div className="h-7 w-6 shrink-0 rounded bg-black/10 dark:bg-white/10" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-full rounded bg-black/[0.07] dark:bg-white/[0.07]" />
                  <div className="h-4 w-5/6 rounded bg-black/[0.07] dark:bg-white/[0.07]" />
                </div>
              </div>
            ))}
          </section>
        </div>
      </article>
    </>
  );
}
