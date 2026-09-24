import { ok, err, type Result } from "@/server/result";
import type { ImportError } from "./recipe-import.service";

// Fetching what the importers read — a recipe page, a video page, a
// transcript — without becoming a way into our own network.
//
// Every URL fetched here is vetted, and so is every redirect it takes, because
// none of them can be trusted: the user typed the first, and the rest were
// named by pages on the open web. It speaks the importers' error type, with
// messages that point the user at pasting instead, because the importers are
// all that use it.

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
 * that refusal is surfaced to the user as "paste the recipe instead" rather
 * than worked around.
 */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function isBlockedIpv4(a: number, b: number): boolean {
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  // Carrier-grade NAT — private in practice, and used inside cloud networks.
  if (a === 100 && b >= 64 && b <= 127) return true;
  // Link-local — this is the cloud metadata range.
  if (a === 169 && b === 254) return true;
  return false;
}

/**
 * `URL` has already canonicalised the address — compressed zeros, lowercase
 * hex, an embedded IPv4 rewritten as two hextets — so only that one spelling
 * of each needs recognising.
 */
function isBlockedIpv6(address: string): boolean {
  // Leading zeros: loopback (::1), unspecified (::), and every form that
  // embeds an IPv4 address (::ffff:7f00:1). All of 0::/8 is reserved, so no
  // public host lives there and there is nothing to lose by refusing it whole.
  if (address.startsWith("::")) return true;

  const first = parseInt(address.split(":")[0], 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7, unique-local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10, link-local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8, multicast
  return false;
}

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
 * Hostname and literal-IP forms are refused outright — including the IPv6
 * spellings of an IPv4 address, like `[::ffff:127.0.0.1]`, which `URL`
 * serialises as `::ffff:7f00:1` and which a check that only reads dotted quads
 * would wave through. Every redirect hop is re-checked rather than
 * trusted — a permitted URL redirecting to `http://127.0.0.1` is the obvious way past a check that only runs once.
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
function isBlockedHost(hostname: string): boolean {
  // Brackets are how `URL` marks an IPv6 address; a trailing dot is a fully
  // qualified name that resolves exactly like the one without it, so
  // "localhost." has to be read as "localhost".
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");

  if (host.includes(":")) return isBlockedIpv6(host);

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
  if (ipv4) return isBlockedIpv4(Number(ipv4[1]), Number(ipv4[2]));

  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") || // includes metadata.google.internal
    host.endsWith(".local")
  );
}

/**
 * Whether a URL may be fetched at all — run on every URL before it's fetched,
 * whoever named it, and again on every redirect, since a hop can change the
 * scheme as easily as the host.
 */
function vetUrl(url: URL): ImportError | null {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { kind: "invalid", message: "Only web links can be imported." };
  }
  if (isBlockedHost(url.hostname)) {
    return { kind: "blocked", message: "That link can't be imported." };
  }
  return null;
}

/** Parse and vet a URL the user typed. */
export function parseUserUrl(input: string): Result<URL, ImportError> {
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

  const refusal = vetUrl(url);
  return refusal ? err(refusal) : ok(url);
}

const UNREACHABLE: ImportError = {
  kind: "unreachable",
  message:
    "We couldn't reach that page. Copy the recipe from it and add it with “Paste a recipe” instead.",
};

/** The page's declared charset, if it names one this runtime can decode. */
function decoderFor(response: Response): TextDecoder {
  const charset = /charset=["']?([^"';\s]+)/i.exec(
    response.headers.get("content-type") ?? "",
  )?.[1];
  try {
    return new TextDecoder(charset ?? "utf-8");
  } catch {
    return new TextDecoder("utf-8");
  }
}

/**
 * Read a response body, giving up rather than buffering something enormous.
 * Null means it was too big; a body that fails partway through — the timeout
 * firing mid-stream, a dropped connection — throws, like `fetch` itself does.
 */
async function readCapped(response: Response): Promise<string | null> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_BYTES) {
    await response.body?.cancel();
    return null;
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
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

  return decoderFor(response).decode(Buffer.concat(chunks));
}

/**
 * Fetch a page — or a transcript, or anything else read as text — following
 * redirects by hand so each hop is vetted.
 *
 * `redirect: "manual"` is what makes the check above worth anything — the
 * default follows redirects inside `fetch`, where a hop to loopback would never
 * be seen.
 *
 * The first URL is vetted too, not only the hops: not every URL fetched here
 * was typed by the user — a video page names its own transcript, a caption
 * names a blog — and those are no more trustworthy than a redirect.
 */
export async function fetchText(
  start: URL,
  accept = "text/html,application/xhtml+xml",
): Promise<Result<string, ImportError>> {
  let url = start;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // The whole point of following by hand.
    const refusal = vetUrl(url);
    if (refusal) return err(refusal);

    try {
      const response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          "user-agent": USER_AGENT,
          accept,
          "accept-language": "en-US,en;q=0.9",
        },
      });

      if (response.status >= 300 && response.status < 400) {
        // Nothing here is read, and an unread body holds its connection open.
        await response.body?.cancel();

        const location = response.headers.get("location");
        const next = location ? URL.parse(location, url) : null;
        if (!next) return err(UNREACHABLE);

        url = next;
        continue;
      }

      if (!response.ok) {
        await response.body?.cancel();
        // 402 and 403 are what the big publishers answer a server-side request
        // with. There is nothing to retry and nothing to work around, so say
        // the useful thing instead.
        return err({
          kind: "unreachable",
          message:
            "That site won't let us read the page. Copy the recipe from it and add it with “Paste a recipe” instead.",
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
    } catch {
      // A network failure, or the timeout — which can fire while the body is
      // still arriving, not only while waiting for the headers.
      return err(UNREACHABLE);
    }
  }

  return err({
    kind: "unreachable",
    message: "That link redirected too many times.",
  });
}
