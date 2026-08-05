import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

// The landing page is the pitch, and the pitch is only for people who haven't
// bought in yet. Signed-in visitors go straight to their library.
export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-5xl px-4 py-20">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
        Cook together. 🍅
      </h1>
      <p className="mt-4 max-w-xl text-lg text-black/70 dark:text-white/70">
        Tomato Tomato is a collaborative cookbook. Build shared cookbooks, add
        your recipes, and invite friends to cook along.
      </p>

      <div className="mt-8 flex gap-3">
        <Link
          href="/sign-up"
          className="rounded-md bg-red-600 px-5 py-2.5 font-medium text-white hover:bg-red-700"
        >
          Get started
        </Link>
        <Link
          href="/sign-in"
          className="rounded-md border border-black/15 px-5 py-2.5 font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
