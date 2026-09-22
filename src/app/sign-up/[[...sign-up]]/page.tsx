import { SignUp } from "@clerk/nextjs";
import { afterSignUpPath, safeReturnPath } from "@/lib/return-path";

// Where sign-up finishes is decided here, as a prop, rather than left to the
// `redirect_url` search param. Clerk gives a prop precedence over the param
// and the environment fallback, and the param alone didn't reliably survive
// the whole sign-up: a new account from a cookbook's invite link ended up on
// the dashboard, with the link it came from forgotten.
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
}) {
  const next = safeReturnPath((await searchParams).redirect_url);

  return (
    <div className="flex justify-center px-4 py-12">
      <SignUp
        forceRedirectUrl={afterSignUpPath(next)}
        // Switching to "Sign in" partway through keeps the destination too.
        signInForceRedirectUrl={next}
      />
    </div>
  );
}
