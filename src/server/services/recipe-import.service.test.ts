import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { importFromText, importFromUrl } from "./recipe-import.service";

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("importFromText", () => {
  it("turns a pasted recipe into form values", () => {
    const result = importFromText(
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

  it("refuses an empty paste", () => {
    const result = importFromText("   ");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("invalid");
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
  });

  it("refuses the private ranges", async () => {
    await mustNotFetch("http://10.0.0.5/");
    await mustNotFetch("http://172.16.4.2/");
    await mustNotFetch("http://172.31.255.1/");
    await mustNotFetch("http://192.168.1.1/");
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

  // 172.32 is public; blocking it would be a bug in the other direction.
  it("allows a public address just outside the private range", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(htmlResponse(fixture("king-arthur")));
    vi.stubGlobal("fetch", fetchSpy);

    await importFromUrl("http://172.32.0.1/recipe");
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
    expect(result.ok).toBe(false);
  });
});
