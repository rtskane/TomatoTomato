"use client";

import { useSyncExternalStore } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { buildClerkAppearance } from "@/lib/clerk-appearance";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribe(onStoreChange: () => void) {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onStoreChange);
  return () => query.removeEventListener("change", onStoreChange);
}

const getSnapshot = () => window.matchMedia(DARK_QUERY).matches;

// There's no colour scheme to read while rendering on the server, so assume
// light — the client corrects it on hydration.
const getServerSnapshot = () => false;

/**
 * ClerkProvider with an appearance that follows the OS colour scheme.
 *
 * Clerk's `colorNeutral` has to be a literal colour rather than a CSS variable
 * (it derives alpha shades from it), so unlike the app's own tokens it can't
 * respond to a media query on its own. Subscribing to `prefers-color-scheme`
 * here and handing Clerk the matching config is what keeps its text legible in
 * dark mode.
 *
 * `useSyncExternalStore` rather than useState + useEffect: it's the API meant
 * for external subscriptions, it takes an explicit server snapshot so hydration
 * can't mismatch, and it avoids the extra commit a setState-in-effect costs.
 */
export default function ClerkProviderThemed({
  children,
}: {
  children: React.ReactNode;
}) {
  const isDark = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  return (
    <ClerkProvider appearance={buildClerkAppearance(isDark)}>
      {children}
    </ClerkProvider>
  );
}
