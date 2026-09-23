"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Bigger on the landing page only — everywhere else keeps the compact mark.
export default function HeaderLogo() {
  const isLanding = usePathname() === "/";

  return (
    <Link href="/" aria-label="Tomato Tomato">
      <Image
        src="/icons/tomato-tomato-mark.png"
        alt="Tomato Tomato"
        width={558}
        height={245}
        className={isLanding ? "h-18 w-auto" : "h-9 w-auto"}
        priority
      />
    </Link>
  );
}
