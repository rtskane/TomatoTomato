"use client";

import { useLinkStatus } from "next/link";

/**
 * Inline pending hint for a parent `<Link>`. Renders an absolute overlay that
 * dims the positioned card ancestor while navigation is in flight — so a click
 * registers immediately even before the route's `loading.tsx` shell arrives.
 *
 * CSS `animation-delay` keeps fast navigations from flashing the overlay.
 */
export default function LinkPending() {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden
      className={`link-pending-overlay${pending ? " is-pending" : ""}`}
    />
  );
}
