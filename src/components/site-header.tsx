import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import UserMenu from "@/components/user-menu";

// Server component: reads auth state directly instead of using client
// <SignedIn>/<SignedOut> control components (not exported in this SDK version).
export default async function SiteHeader() {
  const { userId } = await auth();

  return (
    <header className="border-b border-black/10 dark:border-white/15">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          🍅 Tomato&nbsp;Tomato
        </Link>

        <nav className="flex items-center gap-3 text-sm">
          {userId ? (
            <>
              <Link href="/dashboard" className="hover:underline">
                Dashboard
              </Link>
              <UserMenu />
            </>
          ) : (
            <>
              <SignInButton>
                <button className="rounded-md px-3 py-1.5 hover:bg-black/5 dark:hover:bg-white/10">
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton>
                <button className="rounded-md bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700">
                  Sign up
                </button>
              </SignUpButton>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
