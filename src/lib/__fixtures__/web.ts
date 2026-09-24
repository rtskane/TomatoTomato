import { vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The web, as the importer tests see it: saved pages, and a fake `fetch` that
// answers with them.

/** A saved page from this folder. */
export const fixture = (name: string, extension = "html") =>
  readFileSync(join(__dirname, `${name}.${extension}`), "utf8");

/** A Response whose body streams, because that is what the reader expects. */
export function htmlResponse(html: string, init: ResponseInit = {}) {
  return new Response(new TextEncoder().encode(html), {
    status: 200,
    headers: { "content-type": "text/html" },
    ...init,
  });
}

/**
 * Stub `fetch` with a fake web: each URL starting with one of `pages`' keys
 * answers with its page, and everything else is a 404. Returns the stub, to
 * see what was asked for.
 */
export function serve(pages: Record<string, string | Response>) {
  const fetchSpy = vi.fn(async (input: URL | string) => {
    const href = String(input);
    const page = Object.entries(pages).find(([prefix]) => href.startsWith(prefix))?.[1];
    if (page === undefined) return new Response("not found", { status: 404 });
    return typeof page === "string" ? htmlResponse(page) : page;
  });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

/** Every URL a `serve` stub was asked for, in order. */
export const fetched = (fetchSpy: ReturnType<typeof serve>) =>
  fetchSpy.mock.calls.map(([input]) => String(input));
