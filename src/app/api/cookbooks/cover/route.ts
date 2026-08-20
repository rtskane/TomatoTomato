import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { ensureUser } from "@/lib/user";

/**
 * Issues the short-lived tokens the browser needs to upload a cover image
 * straight to Vercel Blob.
 *
 * The file never passes through this route — only the permission to send it
 * does. That is the reason for the client-upload flow rather than posting the
 * image to a Server Action: a Server Action body is capped well below the size
 * of a photo off a phone, and streaming megabytes through a function would be
 * paid for twice, once inbound and once out.
 *
 * ## What this checks, and what it doesn't
 *
 * It checks that the caller is a signed-in, onboarded user, and constrains
 * what their token can do: image types only, 8 MB, and a pathname under
 * `cookbook-covers/`.
 *
 * The sign-in check runs *before* `handleUpload`, not inside its
 * `onBeforeGenerateToken` callback where it would read more naturally. The SDK
 * validates its own configuration first and throws on a missing
 * BLOB_READ_WRITE_TOKEN before it ever calls that callback — so a check in
 * there is a check whose running depends on someone else's ordering. Up here it
 * is the first thing that happens, and an anonymous request is refused whatever
 * the SDK is doing.
 *
 * It does NOT check which cookbook the image is for, because at this point
 * there may not be one — the create form uploads before the cookbook exists.
 * A URL is just bytes in a bucket until `updateCookbook`/`createCookbook`
 * attaches it, and those enforce ownership. So the worst an authenticated
 * caller can do here is spend a little of our storage.
 */

const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
];

/** Comfortably above a phone photo, far below what a function could stream. */
const MAX_BYTES = 8 * 1024 * 1024;

const PATH_PREFIX = "cookbook-covers/";

export async function POST(request: Request): Promise<Response> {
  // Route handlers are public by default — this is the auth boundary.
  // ensureUser returns null rather than redirecting, which is what a fetch()
  // caller can actually use.
  const user = await ensureUser();
  if (!user?.username) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // The client names the file, so the name is checked rather than
        // trusted: without this an upload could be aimed anywhere in the store.
        if (!pathname.startsWith(PATH_PREFIX)) {
          throw new Error("Unexpected upload path.");
        }

        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_BYTES,
          // Two people uploading "cover.jpg" must not overwrite each other.
          addRandomSuffix: true,
        };
      },
    });

    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Upload failed.";
    return Response.json({ error: message }, { status: 400 });
  }
}
