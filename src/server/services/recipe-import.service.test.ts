import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { findMembership } = vi.hoisted(() => ({ findMembership: vi.fn() }));
vi.mock("@/server/repositories/cookbook.repository", () => ({
  cookbookRepository: { findMembership },
}));

import {
  importFromText as importFromTextAs,
  importFromUrl as importFromUrlAs,
} from "./recipe-import.service";

// Most tests here are about parsing and fetching, not permissions, so they
// import as a member who is allowed to — the permission tests say otherwise.
const importFromText = (text: string) => importFromTextAs("u1", "cb1", text);
const importFromUrl = (url: string) => importFromUrlAs("u1", "cb1", url);

const fixture = (name: string) =>
  readFileSync(join(__dirname, "../../lib/__fixtures__", `${name}.html`), "utf8");

/** A Response whose body streams, because that is what the reader expects. */
function htmlResponse(html: string, init: ResponseInit = {}) {
  return new Response(new TextEncoder().encode(html), {
    status: 200,
    headers: { "content-type": "text/html" },
    ...init,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  findMembership.mockResolvedValue({ role: "EDITOR" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("who may import", () => {
  // Importing writes nothing, but the link importer makes our server fetch a
  // URL of the caller's choosing — so it is gated exactly like adding a recipe.
  it.each([
    ["a non-member", null],
    ["a viewer", { role: "VIEWER" }],
  ])("refuses %s, and never fetches for them", async (_who, membership) => {
    findMembership.mockResolvedValue(membership);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const fromUrl = await importFromUrlAs("u1", "cb1", "https://example.com/r");
    const fromText = await importFromTextAs("u1", "cb1", "Toast\nToast it.");

    expect(fromUrl).toMatchObject({ ok: false, error: { kind: "forbidden" } });
    expect(fromText).toMatchObject({ ok: false, error: { kind: "forbidden" } });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(findMembership).toHaveBeenCalledWith("cb1", "u1");
  });

  it.each(["OWNER", "EDITOR"])("lets an %s import", async (role) => {
    findMembership.mockResolvedValue({ role });
    expect((await importFromTextAs("u1", "cb1", "Toast\nToast it.")).ok).toBe(true);
  });
});

describe("importFromText", () => {
  it("turns a pasted recipe into form values", async () => {
    const result = await importFromText(
      [
        "Weeknight Carbonara",
        "Ingredients",
        "200 g spaghetti",
        "2 eggs",
        "Method",
        "Boil the pasta.",
        "Stir the eggs through off the heat.",
      ].join("\n"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe("Weeknight Carbonara");
    expect(result.value.ingredients).toHaveLength(2);
    expect(result.value.steps).toHaveLength(2);
  });

  it("refuses an empty paste", async () => {
    const result = await importFromText("   ");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("invalid");
  });

  it("says so when the paste has nothing recognisable in it", async () => {
    // Headings with nothing under them: no ingredients, no steps.
    const result = await importFromText("Ingredients\n\nMethod\n");
    expect(result).toMatchObject({ ok: false, error: { kind: "unparseable" } });
  });
});

// These are the tests that matter most in this file. `importFromUrl` takes a
// string from a signed-in user and makes our server request it, which is a
// server-side request forgery primitive if the vetting is wrong — and the
// interesting target is not the public web but the cloud metadata endpoint and
// anything else bound to the private network the function runs in.
describe("importFromUrl — what it refuses to fetch", () => {
  const mustNotFetch = async (url: string) => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await importFromUrl(url);

    expect(result.ok).toBe(false);
    // The point is not the error — it is that no request was ever made.
    expect(fetchSpy).not.toHaveBeenCalled();
  };

  it("refuses the cloud metadata endpoint", async () => {
    await mustNotFetch("http://169.254.169.254/latest/meta-data/");
    await mustNotFetch("http://metadata.google.internal/");
  });

  it("refuses loopback in every spelling", async () => {
    await mustNotFetch("http://localhost:8000/admin");
    await mustNotFetch("http://127.0.0.1/");
    await mustNotFetch("http://127.1.1.1/");
    await mustNotFetch("http://0.0.0.0/");
    await mustNotFetch("http://[::1]/");
    // A trailing dot is the same name, fully qualified.
    await mustNotFetch("http://localhost./");
    await mustNotFetch("http://LOCALHOST/");
  });

  // `URL` rewrites these to `::ffff:7f00:1` and friends, so a check that only
  // reads dotted quads never sees the 127 inside.
  it("refuses an IPv4 address spelled as IPv6", async () => {
    await mustNotFetch("http://[::ffff:127.0.0.1]/");
    await mustNotFetch("http://[::ffff:169.254.169.254]/");
    await mustNotFetch("http://[::127.0.0.1]/");
    await mustNotFetch("http://[::]/");
  });

  it("refuses the private and link-local IPv6 ranges", async () => {
    await mustNotFetch("http://[fd12:3456::1]/");
    await mustNotFetch("http://[fc00::1]/");
    await mustNotFetch("http://[fe80::1]/");
    await mustNotFetch("http://[ff02::1]/");
  });

  it("refuses an IPv4 address written as a single number", async () => {
    // `URL` normalises this to 127.0.0.1 before the check sees it.
    await mustNotFetch("http://2130706433/");
  });

  it("refuses the private ranges", async () => {
    await mustNotFetch("http://10.0.0.5/");
    await mustNotFetch("http://172.16.4.2/");
    await mustNotFetch("http://172.31.255.1/");
    await mustNotFetch("http://192.168.1.1/");
    await mustNotFetch("http://100.64.0.1/");
  });

  it("refuses internal-looking names", async () => {
    await mustNotFetch("http://db.internal/");
    await mustNotFetch("http://printer.local/");
    await mustNotFetch("http://app.localhost/");
  });

  it("refuses a non-web scheme", async () => {
    await mustNotFetch("file:///etc/passwd");
    await mustNotFetch("ftp://example.com/recipe");
  });

  it("refuses an empty link and one that won't parse", async () => {
    await mustNotFetch("   ");
    await mustNotFetch("https://exa mple.com/");
  });

  // 172.32 is public; blocking it would be a bug in the other direction.
  it("allows a public address just outside the private range", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(htmlResponse(fixture("king-arthur")));
    vi.stubGlobal("fetch", fetchSpy);

    await importFromUrl("http://172.32.0.1/recipe");
    expect(fetchSpy).toHaveBeenCalled();
  });

  // The IPv6 ranges are prefixes of an address, not of a name — a real site
  // whose domain happens to start with "fc" or "fd" is not a private network.
  it.each([
    "https://fdc.nal.usda.gov/food/123",
    "https://fcbarcelona.com/recipes/paella",
    "https://[2606:4700::1111]/recipe",
  ])("allows %s", async (url) => {
    const fetchSpy = vi.fn().mockResolvedValue(htmlResponse(fixture("king-arthur")));
    vi.stubGlobal("fetch", fetchSpy);

    expect((await importFromUrl(url)).ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalled();
  });
});

describe("importFromUrl — redirects", () => {
  // A permitted URL that redirects to loopback is the obvious way past a check
  // that only runs on the URL the user typed.
  it("re-checks every hop and refuses one that lands somewhere private", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data/" },
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const result = await importFromUrl("https://example.com/recipe");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("blocked");
    // It followed the first hop, and stopped at the second.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("refuses a hop that switches to a non-web scheme", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, { status: 302, headers: { location: "file:///etc/passwd" } }),
      ),
    );

    const result = await importFromUrl("https://example.com/recipe");
    expect(result).toMatchObject({ ok: false, error: { kind: "invalid" } });
  });

  // A 3xx with nowhere to go is a broken page, not a redirect loop.
  it("reports a redirect with no destination as unreachable", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 302 }));
    vi.stubGlobal("fetch", fetchSpy);

    const result = await importFromUrl("https://example.com/recipe");
    expect(result).toMatchObject({ ok: false, error: { kind: "unreachable" } });
    if (result.ok) return;
    expect(result.error.message).not.toMatch(/too many/i);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("follows a redirect that stays on the public web", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: { location: "https://www.example.com/recipe" },
        }),
      )
      .mockResolvedValueOnce(htmlResponse(fixture("king-arthur")));
    vi.stubGlobal("fetch", fetchSpy);

    const result = await importFromUrl("https://example.com/recipe");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe("Classic Birthday Cake");
  });

  it("gives up rather than looping forever", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://example.com/again" },
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const result = await importFromUrl("https://example.com/recipe");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("unreachable");
    expect(result.error.message).toMatch(/too many/i);
    // The first request, then MAX_REDIRECTS more.
    expect(fetchSpy).toHaveBeenCalledTimes(6);
  });
});

describe("importFromUrl — what it does with a page", () => {
  it("imports a real publisher's page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(htmlResponse(fixture("king-arthur"))),
    );

    const result = await importFromUrl("kingarthurbaking.com/recipes/cake");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe("Classic Birthday Cake");
    expect(result.value.ingredients).toHaveLength(16);
  });

  // What the big publishers actually answer a server-side request with. There
  // is nothing to retry, so the message points at the path that does work.
  it("tells the user to paste when a publisher refuses us", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 402 })),
    );

    const result = await importFromUrl("https://www.allrecipes.com/recipe/1");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/paste/i);
  });

  // Scraping the visible text of a recipe page yields navigation, comments and
  // advertising. Saying so beats handing someone a recipe they have to repair.
  it("says so rather than scraping a page with no structured data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(htmlResponse("<html><body>A blog post</body></html>")),
    );

    const result = await importFromUrl("https://example.com/post");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("unparseable");
    expect(result.error.message).toMatch(/paste/i);
  });

  it("reports a network failure as unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const result = await importFromUrl("https://example.com/recipe");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("unreachable");
  });

  it("refuses a page that declares itself enormous", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        htmlResponse("<html></html>", {
          headers: { "content-length": String(50 * 1024 * 1024) },
        }),
      ),
    );

    const result = await importFromUrl("https://example.com/recipe");
    expect(result).toMatchObject({ ok: false, error: { message: /too large/i } });
  });

  // Content-Length is optional and can lie, so the cap is enforced on the bytes
  // actually received too.
  it("stops reading a page that turns out enormous", async () => {
    const megabyte = new Uint8Array(1024 * 1024);
    let sent = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 1;
        controller.enqueue(megabyte);
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(endless)));

    const result = await importFromUrl("https://example.com/recipe");
    expect(result).toMatchObject({ ok: false, error: { message: /too large/i } });
    expect(sent).toBeLessThan(10);
  });

  // The timeout can fire after the headers arrive, while the body is still
  // coming in. That has to come back as a message, not escape as an exception
  // and take the page down with it.
  it("reports a page that fails partway through as unreachable", async () => {
    const stalls = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("<html>"));
      },
      pull() {
        throw new DOMException("The operation timed out.", "TimeoutError");
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stalls)));

    const result = await importFromUrl("https://example.com/recipe");
    expect(result).toMatchObject({ ok: false, error: { kind: "unreachable" } });
  });

  it("decodes a page in the charset it declares", async () => {
    const latin1 = Uint8Array.from(
      Buffer.from(
        '<script type="application/ld+json">' +
          JSON.stringify({ "@type": "Recipe", name: "Crème brûlée", recipeIngredient: ["4 eggs"] }) +
          "</script>",
        "latin1",
      ),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(latin1, {
          headers: { "content-type": "text/html; charset=ISO-8859-1" },
        }),
      ),
    );

    const result = await importFromUrl("https://example.com/recipe");
    expect(result).toMatchObject({ ok: true, value: { title: "Crème brûlée" } });
  });

  it("reads a page that doesn't say what it is as UTF-8", async () => {
    const bytes = new TextEncoder().encode(fixture("king-arthur"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(bytes)));

    expect((await importFromUrl("https://example.com/recipe")).ok).toBe(true);
  });

  it("treats an empty response as a page with no recipe on it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    const result = await importFromUrl("https://example.com/recipe");
    expect(result).toMatchObject({ ok: false, error: { kind: "unparseable" } });
  });

  it("falls back to UTF-8 for a charset it doesn't know", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        htmlResponse(fixture("king-arthur"), {
          headers: { "content-type": "text/html; charset=made-up" },
        }),
      ),
    );

    expect((await importFromUrl("https://example.com/recipe")).ok).toBe(true);
  });
});
