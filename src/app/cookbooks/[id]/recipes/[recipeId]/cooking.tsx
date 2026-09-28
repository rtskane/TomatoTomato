"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  formatIngredient,
  formatQuantity,
  unitFor,
  SCALE_MULTIPLIERS,
} from "@/lib/recipe-display";
import {
  FRESH_PROGRESS,
  PROGRESS_KEY_PREFIX,
  clearTicks,
  parseProgress,
  progressKey,
  setFactor,
  toggleTick,
  type CookingProgress,
  type TickKind,
} from "@/lib/cooking-progress";

// Cooking mode: the parts of the recipe page you use with flour on your hands.
// Scaling, ticking off ingredients and steps, keeping the screen awake. The
// article around them stays a Server Component; these are the islands in it,
// sharing one piece of state through context.
//
// That state is `CookingProgress`, kept in localStorage per recipe. It's read
// with useSyncExternalStore, whose server snapshot is fresh progress — so the
// server renders an unticked, unscaled recipe, and React swaps in what this
// device remembers after hydration without a mismatch.

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

const listeners = new Set<() => void>();

// Private browsing, a full disk or blocked site data can make localStorage
// throw. Memory keeps ticking working for the life of the tab regardless.
const memory = new Map<string, string>();

// Memory is only a stand-in for storage that throws, never a second copy:
// consulted alongside working storage, it would bring back progress another
// tab had just cleared.
function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function writeRaw(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    memory.set(key, value);
  }
  for (const listener of listeners) listener();
}

let swept = false;

/** Tests only: let the next subscription sweep again, as a new page load would. */
export function resetSweepForTests() {
  swept = false;
}

/**
 * Delete every recipe's progress that has lapsed or can't be read. Expired
 * progress already reads as fresh, but without this its entry would stay in
 * storage for good — one per recipe ever cooked. Once per page load, and for
 * every recipe rather than just this one, since a recipe nobody reopens would
 * otherwise never be cleaned up.
 */
function sweepStaleProgress() {
  if (swept) return;
  swept = true;
  try {
    const now = Date.now();
    const stale: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (
        key?.startsWith(PROGRESS_KEY_PREFIX) &&
        parseProgress(window.localStorage.getItem(key), now) === FRESH_PROGRESS
      ) {
        stale.push(key);
      }
    }
    // Collected first: removing while iterating shifts the indexes.
    for (const key of stale) window.localStorage.removeItem(key);
  } catch {
    // Storage unavailable — then there's nothing stored to sweep.
  }
}

function subscribe(listener: () => void) {
  sweepStaleProgress();
  listeners.add(listener);
  // Another tab of the same recipe ticking something.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

// useSyncExternalStore needs the same object back until something changes, so
// each parse is kept against the raw string it came from.
const parsed = new Map<string, { raw: string | null; value: CookingProgress }>();

function snapshot(key: string): CookingProgress {
  const raw = readRaw(key);
  const cached = parsed.get(key);
  if (cached && cached.raw === raw) return cached.value;
  const value = parseProgress(raw, Date.now());
  parsed.set(key, { raw, value });
  return value;
}

const serverSnapshot = () => FRESH_PROGRESS;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type Cooking = {
  progress: CookingProgress;
  update: (change: (progress: CookingProgress, now: number) => CookingProgress) => void;
};

const CookingContext = createContext<Cooking | null>(null);

function useCooking(): Cooking {
  const cooking = useContext(CookingContext);
  if (!cooking) throw new Error("Cooking controls must sit inside <CookingProvider>.");
  return cooking;
}

export function CookingProvider({
  recipeId,
  children,
}: {
  recipeId: string;
  children: React.ReactNode;
}) {
  const key = progressKey(recipeId);
  const progress = useSyncExternalStore(
    subscribe,
    () => snapshot(key),
    serverSnapshot,
  );
  const update = useCallback<Cooking["update"]>(
    (change) => writeRaw(key, JSON.stringify(change(snapshot(key), Date.now()))),
    [key],
  );
  const value = useMemo(() => ({ progress, update }), [progress, update]);

  return <CookingContext value={value}>{children}</CookingContext>;
}

// ---------------------------------------------------------------------------
// Scaling
// ---------------------------------------------------------------------------

/** Past this a stepper is the wrong tool; it's a different recipe. */
const MAX_SERVINGS = 99;

const stepperButton =
  "flex size-8 items-center justify-center rounded-full border border-border text-body " +
  "text-foreground-secondary hover:bg-background-secondary disabled:opacity-40";

/**
 * "Serves [−] 6 [+]" for a recipe that says how many it serves; "Scale ½× 1×
 * 2× 3×" for one that doesn't, since there's no number to step from. Renders a
 * <dt>/<dd> pair, for the stats list it sits in.
 */
export function ScaleControl({ servings }: { servings: number | null }) {
  const { progress, update } = useCooking();
  const { factor } = progress;

  if (servings === null) {
    return (
      <div>
        <dt className="text-[11px] font-medium uppercase tracking-widest text-foreground-muted">
          Scale
        </dt>
        <dd className="mt-1 flex gap-1">
          {SCALE_MULTIPLIERS.map((multiplier) => (
            <button
              key={multiplier}
              type="button"
              aria-pressed={factor === multiplier}
              onClick={() => update((p, now) => setFactor(p, multiplier, now))}
              className="rounded-md px-2 py-1 text-subheadline font-medium text-foreground-secondary hover:bg-background-secondary aria-pressed:bg-accent aria-pressed:text-on-accent"
            >
              {formatQuantity(multiplier)}×
            </button>
          ))}
        </dd>
      </div>
    );
  }

  const target = Math.min(MAX_SERVINGS, Math.max(1, Math.round(servings * factor)));
  const scaleTo = (next: number) =>
    update((p, now) => setFactor(p, next / servings, now));

  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-widest text-foreground-muted">
        Serves
      </dt>
      <dd className="mt-1 flex items-center gap-2">
        <button
          type="button"
          aria-label="Fewer servings"
          disabled={target <= 1}
          onClick={() => scaleTo(target - 1)}
          className={stepperButton}
        >
          −
        </button>
        <output
          aria-live="polite"
          className="min-w-[2ch] text-center text-subheadline font-medium tabular-nums"
        >
          {target}
          {/* Announced as it changes; "6" alone doesn't say six of what. */}
          <span className="sr-only"> servings</span>
        </output>
        <button
          type="button"
          aria-label="More servings"
          disabled={target >= MAX_SERVINGS}
          onClick={() => scaleTo(target + 1)}
          className={stepperButton}
        >
          +
        </button>
        {target !== servings ? (
          <button
            type="button"
            onClick={() => scaleTo(servings)}
            className="ml-1 text-caption-1 text-foreground-tertiary hover:underline"
          >
            Reset to {servings}
          </button>
        ) : null}
      </dd>
    </div>
  );
}

/**
 * Said once, above the method, whenever the recipe is scaled: the ingredients
 * list scales, but "add 200 g of flour" written into a step is just text.
 */
export function ScaleNote() {
  const { progress } = useCooking();
  if (progress.factor === 1) return null;
  return (
    <p className="mt-2 text-caption-1 text-foreground-tertiary">
      Amounts written into the steps aren&rsquo;t scaled.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Ticking things off
// ---------------------------------------------------------------------------

function useTick(kind: TickKind, id: string) {
  const { progress, update } = useCooking();
  return {
    ticked: progress[kind].includes(id),
    toggle: () => update((p, now) => toggleTick(p, kind, id, now)),
  };
}

/**
 * One ingredient: tap anywhere on the line to tick it. A real checkbox inside
 * the label, so it's a checkbox to a screen reader and the keyboard too, named
 * by the ingredient itself.
 */
export function IngredientItem({
  id,
  quantity,
  unit,
  name,
  note,
}: {
  id: string;
  quantity: number | null;
  unit: string;
  name: string;
  note: string | null;
}) {
  const { progress } = useCooking();
  const { ticked, toggle } = useTick("ingredients", id);
  const scaled = quantity === null ? null : quantity * progress.factor;
  // Only amounts this page computed are snapped to a measurable fraction; at
  // the recipe's own size, the author's numbers print as they wrote them.
  const snap = progress.factor !== 1;

  return (
    <li className="border-b border-border last:border-0">
      <label className="flex cursor-pointer items-start gap-3 py-2.5 text-subheadline leading-relaxed">
        <input
          type="checkbox"
          checked={ticked}
          onChange={toggle}
          className="mt-1.5 size-4 shrink-0 accent-accent"
        />
        <span className={ticked ? "text-foreground-muted line-through" : undefined}>
          {formatIngredient({
            quantity: formatQuantity(scaled, { snap }),
            unit: unitFor(unit, scaled, { snap }),
            name,
          })}
          {note ? <span className="text-foreground-muted">, {note}</span> : null}
        </span>
      </label>
    </li>
  );
}

/**
 * One step. The numeral is the tick: it turns into a check, and the step
 * dims. No strikethrough — through a paragraph it's unreadable, and you may
 * want to reread a step you've done. The checkbox is visually hidden, so the
 * focus ring goes on the whole step instead.
 */
export function StepItem({
  id,
  number,
  instruction,
}: {
  id: string;
  number: number;
  instruction: string;
}) {
  const { ticked, toggle } = useTick("steps", id);

  return (
    <li>
      <label className="flex cursor-pointer gap-4 rounded-md has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-accent">
        <input type="checkbox" checked={ticked} onChange={toggle} className="sr-only" />
        <span
          aria-hidden="true"
          className="w-[1ch] shrink-0 font-serif text-date-num leading-none text-accent-ink tabular-nums"
        >
          {ticked ? "✓" : number}
        </span>
        {/* A span, not a <p>: a label may only hold phrasing content. */}
        <span
          className={`block font-serif text-headline leading-relaxed whitespace-pre-wrap ${
            ticked ? "text-foreground-muted" : ""
          }`}
        >
          {instruction}
        </span>
      </label>
    </li>
  );
}

/** Only there once something's ticked — there's nothing to clear before. */
export function ClearTicks() {
  const { progress, update } = useCooking();
  if (progress.ingredients.length === 0 && progress.steps.length === 0) return null;
  return (
    <button
      type="button"
      onClick={() => update(clearTicks)}
      className="rounded-md px-2.5 py-1 text-caption-1 font-medium text-foreground-secondary hover:bg-background-secondary"
    >
      Clear ticks
    </button>
  );
}

// ---------------------------------------------------------------------------
// Keeping the screen awake
// ---------------------------------------------------------------------------

const noSubscription = () => () => {};

/**
 * A toggle for the Screen Wake Lock API, so the phone doesn't lock while hands
 * are covered in dough.
 *
 * Hidden where the browser doesn't support it rather than shown and useless.
 * The server can't tell, so it renders nothing and the button appears after
 * hydration.
 *
 * The browser drops the lock whenever the page is hidden — switching apps,
 * locking the phone — and doesn't take it back. So while it's wanted, coming
 * back to the page asks again.
 */
export function KeepScreenOn() {
  const supported = useSyncExternalStore(
    noSubscription,
    () => "wakeLock" in navigator,
    () => false,
  );
  const [wanted, setWanted] = useState(false);
  const [refused, setRefused] = useState(false);
  const lock = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;

    async function acquire() {
      if (lock.current && !lock.current.released) return;
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          await sentinel.release();
          return;
        }
        lock.current = sentinel;
      } catch {
        // Refused — low battery mode, or the page wasn't visible. Say so, and
        // put the toggle back rather than show a promise it isn't keeping.
        if (!cancelled) {
          setWanted(false);
          setRefused(true);
        }
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void acquire();
    }

    void acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void lock.current?.release();
      lock.current = null;
    };
  }, [wanted]);

  if (!supported) return null;

  return (
    <div className="flex items-center gap-2">
      {refused ? (
        <span role="status" className="text-caption-1 text-foreground-tertiary">
          The browser wouldn&rsquo;t allow it.
        </span>
      ) : null}
      <button
        type="button"
        aria-pressed={wanted}
        onClick={() => {
          setRefused(false);
          setWanted(!wanted);
        }}
        className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-caption-1 font-medium text-foreground-secondary hover:bg-background-secondary aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-on-accent"
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          className="size-3.5"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
        Keep screen on
      </button>
    </div>
  );
}
