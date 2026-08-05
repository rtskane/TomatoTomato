import { requireOnboardedUser } from "@/lib/user";

// Resource-based protection: this page guards itself instead of relying on
// path matching in proxy.ts. requireOnboardedUser redirects signed-out visitors
// to sign-in and un-onboarded users to /onboarding.
export default async function DashboardPage() {
  const user = await requireOnboardedUser();

  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Your library</h1>
      <p className="mt-2 text-black/70 dark:text-white/70">
        Welcome{displayName ? `, ${displayName}` : ""}! Your cookbooks will show
        up here.
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
