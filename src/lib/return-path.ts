/**
 * Where to send someone after sign-up or onboarding — or null to use the
 * default.
 *
 * It arrives in a query string, so anyone can write one, and following it
 * blindly would make every "you're all set" redirect an open redirect: a link
 * to our onboarding page that finishes on a lookalike phishing site. So only a
 * path on this site is ever returned.
 *
 * A full URL is accepted but reduced to its path — Clerk's own buttons pass the
 * page they were clicked on that way. Dropping the host is what makes that
 * safe: `https://evil.example.com/x` can only ever come back as `/x`, here.
 */
export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // Control characters (a tab or newline mid-URL) are stripped by browsers,
  // which can turn a harmless-looking path back into "//host".
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return safeReturnPath(`${url.pathname}${url.search}${url.hash}`);
    } catch {
      return null;
    }
  }

  if (!value.startsWith("/")) return null;
  // Browsers read both of these as the start of another host.
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  return value;
}

/**
 * Where a brand-new account goes first: onboarding, since nothing else works
 * without a username — carrying on to `next` afterwards if there is one.
 * Sending them there directly, rather than to a page that redirects to it,
 * keeps the first navigation after sign-up to a single hop.
 */
export function afterSignUpPath(next: string | null): string {
  return next ? `/onboarding?next=${encodeURIComponent(next)}` : "/onboarding";
}
