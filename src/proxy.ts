import { clerkMiddleware } from "@clerk/nextjs/server";

// Next.js 16 renamed the `middleware` convention to `proxy`. clerkMiddleware()
// runs on every matched request so that auth() works in pages/routes.
//
// We deliberately do NOT gate routes by path here. Clerk (and Next 16) now
// recommend resource-based auth checks: each protected page/route calls auth()
// and redirects itself. Path matching in middleware can drift from how Next
// actually routes requests and leave protected data reachable.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Run on everything except Next internals and static files...
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // ...and always run on API routes.
    "/(api|trpc)(.*)",
  ],
};
