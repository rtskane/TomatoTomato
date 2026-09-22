import { SignIn } from "@clerk/nextjs";
import { afterSignUpPath, safeReturnPath } from "@/lib/return-path";

// See the sign-up page: the destination is passed as a prop because Clerk
// honours a prop over the `redirect_url` param. Without one (`next` null), the
// environment fallback — the dashboard — still applies.
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
}) {
  const next = safeReturnPath((await searchParams).redirect_url);

  return (
    <div className="flex justify-center px-4 py-12">
      <SignIn
        forceRedirectUrl={next}
        // Switching to "Sign up" partway through makes a new account, which
        // needs onboarding first.
        signUpForceRedirectUrl={afterSignUpPath(next)}
      />
    </div>
  );
}
