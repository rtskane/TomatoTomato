"use client";

import { usePathname } from "next/navigation";

// Thin client shell around <header> so it can react to the route without
// making the whole SiteHeader (which reads auth server-side) a client
// component. Blue only on the landing page — everywhere else keeps the
// default cream chrome.
export default function HeaderChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  const isLanding = usePathname() === "/";

  return (
    <header
      className={
        isLanding ? "bg-secondary" : "border-b border-border"
      }
    >
      {children}
    </header>
  );
}
