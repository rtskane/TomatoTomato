import { auth } from "@clerk/nextjs/server";
import { ensureUser } from "@/lib/user";

// Resource-based protection: this page guards itself instead of relying on
// path matching in proxy.ts. Signed-out visitors are redirected to sign-in.
export default async function DashboardPage() {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();

  // Signed in — sync into our Postgres User table and load the row.
  const user = await ensureUser();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Your library</h1>
      <p className="mt-2 text-black/70 dark:text-white/70">
        Welcome{user?.displayName ? `, ${user.displayName}` : ""}! Your cookbooks
        will show up here.
      </p>

      <div className="mt-6 rounded-lg border border-black/10 p-4 text-sm dark:border-white/15">
        <p className="font-medium">Synced to database ✅</p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-black/70 dark:text-white/70">
          <dt>DB user id</dt>
          <dd className="font-mono">{user?.id}</dd>
          <dt>Email</dt>
          <dd>{user?.email}</dd>
        </dl>
      </div>
    </div>
  );
}
