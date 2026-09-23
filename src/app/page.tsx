import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

// The landing page is the pitch, and the pitch is only for people who haven't
// bought in yet. Signed-in visitors go straight to their library.
export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col items-center bg-secondary px-4 py-20">
      <Image
        src="/banner.png"
        alt="Tomato Tomato — create your heirloom cookbook"
        width={613}
        height={232}
        priority
        className="h-auto w-full max-w-xl"
      />

      <div className="mt-6 flex gap-3">
        <Link
          href="/sign-up"
          className="rounded-md bg-accent px-5 py-2.5 font-medium text-on-accent hover:bg-accent-hover"
        >
          Get started
        </Link>
        <Link
          href="/sign-in"
          className="rounded-md bg-background px-5 py-2.5 font-medium text-foreground hover:bg-background-secondary"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
