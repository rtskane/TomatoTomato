import { describe, it, expect, vi, afterEach } from "vitest";
import { fixture, htmlResponse } from "@/lib/__fixtures__/web";
import { fetchText, parseUserUrl } from "./safe-fetch";

// These are the tests that matter most for importing. The importers take URLs
// from a signed-in user, and from pages on the open web, and make our server
// request them — a server-side request forgery primitive if the vetting is
// wrong. The interesting target is not the public web but the cloud metadata
// endpoint and anything else bound to the private network the function runs in.

/** What the link importer does with what the user typed. */
async function fetchUserUrl(input: string) {
  const url = parseUserUrl(input);
  return url.ok ? fetchText(url.value) : url;
}

const RECIPE = new URL("https://example.com/recipe");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("what it refuses to fetch", () => {
  /**
   * Refused whether the user typed it or a page named it — a transcript's
   * address, a link in a caption — and either way, never requested.
   */
  const mustNotFetch = async (input: string) => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    expect(parseUserUrl(input).ok).toBe(false);
    const named = URL.parse(input);
    if (named) expect((await fetchText(named)).ok).toBe(false);

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
    const fetchSpy = vi.fn().mockResolvedValue(htmlResponse("<html></html>"));
    vi.stubGlobal("fetch", fetchSpy);

    expect((await fetchUserUrl("http://172.32.0.1/recipe")).ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalled();
  });

  // The IPv6 ranges are prefixes of an address, not of a name — a real site
  // whose domain happens to start with "fc" or "fd" is not a private network.
  it.each([
    "https://fdc.nal.usda.gov/food/123",
    "https://fcbarcelona.com/recipes/paella",
    "https://[2606:4700::1111]/recipe",
  ])("allows %s", async (url) => {
    const fetchSpy = vi.fn().mockResolvedValue(htmlResponse("<html></html>"));
    vi.stubGlobal("fetch", fetchSpy);

    expect((await fetchUserUrl(url)).ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalled();
  });

  // Someone pasting a link rarely types the scheme.
  it("reads a link typed without its scheme as https", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(htmlResponse("<html></html>"));
    vi.stubGlobal("fetch", fetchSpy);

    await fetchUserUrl("kingarthurbaking.com/recipes/cake");
    expect(String(fetchSpy.mock.calls[0][0])).toBe("https://kingarthurbaking.com/recipes/cake");
  });
});

describe("redirects", () => {
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

    const result = await fetchText(RECIPE);

    expect(result).toMatchObject({ ok: false, error: { kind: "blocked" } });
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

    const result = await fetchText(RECIPE);
    expect(result).toMatchObject({ ok: false, error: { kind: "invalid" } });
  });

  // A 3xx with nowhere to go is a broken page, not a redirect loop.
  it("reports a redirect with no destination as unreachable", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 302 }));
    vi.stubGlobal("fetch", fetchSpy);

    const result = await fetchText(RECIPE);
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
      .mockResolvedValueOnce(htmlResponse("<html>the recipe</html>"));
    vi.stubGlobal("fetch", fetchSpy);

    expect(await fetchText(RECIPE)).toEqual({ ok: true, value: "<html>the recipe</html>" });
    expect(String(fetchSpy.mock.calls[1][0])).toBe("https://www.example.com/recipe");
  });

  it("gives up rather than looping forever", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://example.com/again" },
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const result = await fetchText(RECIPE);
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "unreachable", message: /too many/i },
    });
    // The first request, then MAX_REDIRECTS more.
    expect(fetchSpy).toHaveBeenCalledTimes(6);
  });
});

describe("reading what comes back", () => {
  // What the big publishers actually answer a server-side request with. There
  // is nothing to retry, so the message points at the path that does work.
  it("tells the user to paste when a publisher refuses us", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 402 })));

    const result = await fetchText(new URL("https://www.allrecipes.com/recipe/1"));
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "unreachable", message: /“Paste a recipe”/ },
    });
  });

  it("reports a network failure as unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const result = await fetchText(RECIPE);
    expect(result).toMatchObject({ ok: false, error: { kind: "unreachable" } });
  });

  it("asks for what the caller says it wants", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(htmlResponse("WEBVTT"));
    vi.stubGlobal("fetch", fetchSpy);

    await fetchText(RECIPE);
    await fetchText(RECIPE, "text/vtt");

    expect(fetchSpy.mock.calls[0][1].headers.accept).toMatch(/text\/html/);
    expect(fetchSpy.mock.calls[1][1].headers.accept).toBe("text/vtt");
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

    const result = await fetchText(RECIPE);
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

    const result = await fetchText(RECIPE);
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

    const result = await fetchText(RECIPE);
    expect(result).toMatchObject({ ok: false, error: { kind: "unreachable" } });
  });

  it("reads an empty response as empty text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    expect(await fetchText(RECIPE)).toEqual({ ok: true, value: "" });
  });

  it("decodes a page in the charset it declares", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(Uint8Array.from(Buffer.from("Crème brûlée", "latin1")), {
          headers: { "content-type": "text/html; charset=ISO-8859-1" },
        }),
      ),
    );

    expect(await fetchText(RECIPE)).toEqual({ ok: true, value: "Crème brûlée" });
  });

  it("reads a page that doesn't say what it is as UTF-8", async () => {
    const page = fixture("king-arthur");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new TextEncoder().encode(page))));

    expect(await fetchText(RECIPE)).toEqual({ ok: true, value: page });
  });

  it("falls back to UTF-8 for a charset it doesn't know", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        htmlResponse("Crème brûlée", {
          headers: { "content-type": "text/html; charset=made-up" },
        }),
      ),
    );

    expect(await fetchText(RECIPE)).toEqual({ ok: true, value: "Crème brûlée" });
  });
});
