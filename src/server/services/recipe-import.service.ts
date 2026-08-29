import type { CreateRecipeValues } from "@/app/cookbooks/[id]/recipes/recipe-form-data";
import { parseRecipeText } from "@/lib/recipe-import";
import { parseRecipeFromHtml } from "@/lib/recipe-jsonld";
import { ok, err, type Result } from "@/server/result";

// Getting a recipe out of somewhere that isn't our form.
//
// Nothing here writes to the database. Every path returns `CreateRecipeValues`
// — the same shape the form speaks — which the page hands straight to
// `RecipeForm` for the author to check over. The existing `createRecipe` is
// still the only thing that saves, so an import can never store a recipe
// nobody looked at.

export type ImportError = {
  kind: "invalid" | "blocked" | "unreachable" | "unparseable";
  message: string;
};

/** Long enough for a slow publisher, short enough that nobody waits on a hang. */
const FETCH_TIMEOUT_MS = 12_000;

/** A recipe page is HTML. Anything this size is not one. */
const MAX_BYTES = 3 * 1024 * 1024;

/** Redirects are followed by hand so each hop can be re-checked. */
const MAX_REDIRECTS = 5;

/**
 * Presenting as a browser, because a plain fetch is refused by a good share of
 * publishers. This is not an attempt to defeat a paywall — the ones that mean
 * it (People Inc.'s sites answer 402 to anything server-side) still refuse, and
 * that refusal is surfaced to the user as "paste it instead" rather than worked
 * around.
 */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Hostnames that must never be fetched.
 *
 * This function takes a URL from a signed-in user and asks our server to
 * request it — which is a server-side request forgery primitive if it is left
 * open. The danger is not the public internet; it is everything our server can
 * reach and the user cannot: the cloud metadata endpoint at 169.254.169.254
 * that hands out credentials, anything bound to loopback, and the private
 * ranges of whatever network the function runs in.
 *
 * ## What this does and does not stop
 *
 * Hostname and literal-IP forms are refused outright, and every redirect hop is
 * re-checked rather than trusted — a permitted URL redirecting to
 * `http://127.0.0.1` is the obvious way past a check that only runs once.
 *
 * A hostname that resolves to a private address is NOT caught here, because
 * catching it properly means resolving the name, checking the address, and then
 * connecting to that address rather than the name — and `fetch` gives no way to
 * pin the result, so a check would be advisory at best.
 *
 * What limits the damage is that this endpoint never returns what it fetched.
 * Success returns a parsed recipe; every failure returns one of the fixed
 * messages below. So the worst case is blind: a caller can learn roughly
 * whether something answered, and nothing about what it said.
 */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "0.0.0.0",
  "[::1]",
  "::1",
  "metadata.google.internal",
]);

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith(".localhost")) return true;
  if (host.endsWith(".internal") || host.endsWith(".local")) return true;

  // IPv6 loopback and unique-local.
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd")) {
    return true;
  }

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map(Number);
    if (a === 127 || a === 0 || a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    // Link-local — this is the cloud metadata range.
    if (a === 169 && b === 254) return true;
  }

  return false;
}

/** Parse and vet a URL the user typed. */
function safeUrl(input: string): Result<URL, ImportError> {
  const trimmed = input.trim();
  if (trimmed === "") {
    return err({ kind: "invalid", message: "Paste a link to import from." });
  }

  // Someone pasting a link rarely types the scheme, so a bare host gets https.
  // Whether a scheme is present has to be decided BEFORE prepending, not by
  // testing for http: — "ftp://example.com" has a scheme, and prepending to it
  // yields "https://ftp://example.com", a URL that parses cleanly with the
  // hostname "ftp" and sails through every check below.
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  if (hasScheme && !/^https?:\/\//i.test(trimmed)) {
    return err({ kind: "invalid", message: "Only web links can be imported." });
  }

  let url: URL;
  try {
    url = new URL(hasScheme ? trimmed : `https://${trimmed}`);
  } catch {
    return err({ kind: "invalid", message: "That doesn't look like a link." });
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return err({ kind: "invalid", message: "Only web links can be imported." });
  }

  if (isBlockedHost(url.hostname)) {
    return err({ kind: "blocked", message: "That link can't be imported." });
  }

  return ok(url);
}

/** Read a response body, giving up rather than buffering something enormous. */
async function readCapped(response: Response): Promise<string | null> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_BYTES) return null;

  const reader = response.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  return new TextDecoder().decode(
    chunks.reduce<Uint8Array>((joined, chunk) => {
      const next = new Uint8Array(joined.length + chunk.length);
      next.set(joined);
      next.set(chunk, joined.length);
      return next;
    }, new Uint8Array()),
  );
}

/**
 * Fetch a page, following redirects by hand so each hop is vetted.
 *
 * `redirect: "manual"` is what makes the check above worth anything — the
 * default follows redirects inside `fetch`, where a hop to loopback would never
 * be seen.
 */
async function fetchPage(start: URL): Promise<Result<string, ImportError>> {
  let url = start;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml",
          "accept-language": "en-US,en;q=0.9",
        },
      });
    } catch {
      return err({
        kind: "unreachable",
        message: "We couldn't reach that page. Try pasting the recipe instead.",
      });
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) break;

      let next: URL;
      try {
        next = new URL(location, url);
      } catch {
        break;
      }
      // The whole point of following by hand.
      if (isBlockedHost(next.hostname)) {
        return err({ kind: "blocked", message: "That link can't be imported." });
      }
      url = next;
      continue;
    }

    if (!response.ok) {
      // 402 and 403 are what the big publishers answer a server-side request
      // with. There is nothing to retry and nothing to work around, so say the
      // useful thing instead.
      return err({
        kind: "unreachable",
        message:
          "That site won't let us read the page. Copy the recipe and paste it instead.",
      });
    }

    const html = await readCapped(response);
    if (html === null) {
      return err({
        kind: "unreachable",
        message: "That page was too large to read.",
      });
    }
    return ok(html);
  }

  return err({
    kind: "unreachable",
    message: "That link redirected too many times.",
  });
}

/**
 * Import a recipe from a link.
 *
 * Only the publisher's own structured data is trusted. When a page hasn't got
 * any, this reports that rather than scraping the visible text — a recipe page
 * is mostly navigation, comments and advertising, and a "recipe" assembled out
 * of those is worse than no import at all, because the author has to find the
 * damage before they can fix it.
 */
export async function importFromUrl(
  input: string,
): Promise<Result<CreateRecipeValues, ImportError>> {
  const url = safeUrl(input);
  if (!url.ok) return url;

  const page = await fetchPage(url.value);
  if (!page.ok) return page;

  const recipe = parseRecipeFromHtml(page.value);
  if (!recipe) {
    return err({
      kind: "unparseable",
      message:
        "We couldn't find a recipe on that page. Copy it and paste it instead.",
    });
  }

  return ok(recipe);
}

/** Import a recipe from text someone pasted. */
export function importFromText(
  text: string,
): Result<CreateRecipeValues, ImportError> {
  if (text.trim() === "") {
    return err({ kind: "invalid", message: "Paste a recipe to import." });
  }

  const recipe = parseRecipeText(text);
  if (recipe.ingredients.length === 0 && recipe.steps.length === 0) {
    return err({
      kind: "unparseable",
      message: "We couldn't make a recipe out of that. Try adding a bit more.",
    });
  }

  return ok(recipe);
}
