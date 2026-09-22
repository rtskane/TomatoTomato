// The rules for an uploaded image, shared by the field that sends one, the
// route that issues permission to, and the check on what may be stored. The
// route is what enforces the upload limits; the field checks them first only so
// a wrong file gets a clear message instantly instead of a failed upload.
//
// No zod in here: the upload field runs in the browser and imports this file,
// and nothing on the client parses with zod. The schema built on
// `isStoredImageUrl` lives in `stored-image-url.ts` for that reason.

export const UPLOAD_ROUTE = "/api/images";

export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
];

/** Comfortably above a phone photo, far below what a function could stream. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Where in the store each kind of image goes. A folder per kind keeps the store
 * browsable, and the route refuses any path outside these.
 */
export const IMAGE_FOLDERS = ["cookbook-covers", "recipe-photos"] as const;
export type ImageFolder = (typeof IMAGE_FOLDERS)[number];

/**
 * The uploaded file keeps its name so the store is browsable, but only the
 * parts of it that are safe in a URL path. The store adds a random suffix, so
 * two "photo.jpg" uploads still can't collide.
 */
export function uploadPathname(folder: ImageFolder, fileName: string): string {
  const cleaned = fileName
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-64);

  return `${folder}/${cleaned || "image"}`;
}

/**
 * Whether a client-chosen pathname lands in one of our folders. The client
 * names the file, so without this an upload could be aimed anywhere in the
 * store.
 */
export function isAllowedUploadPath(pathname: string): boolean {
  return IMAGE_FOLDERS.some((folder) => {
    if (!pathname.startsWith(`${folder}/`)) return false;
    const name = pathname.slice(folder.length + 1);
    // One level only: no subfolders, no "..", no empty name.
    return name !== "" && !name.includes("/") && name !== "." && name !== "..";
  });
}

/**
 * Where an uploaded image — a cover or a recipe photo — is allowed to live.
 *
 * Vercel Blob serves public files from `<store-id>.public.blob.vercel-storage.com`.
 * Anything else is refused, and that refusal is the point: the URL is
 * client-supplied — the browser uploads the file and posts the resulting URL
 * back in a hidden field — so without this check a crafted POST could point a
 * cover or a recipe photo at any URL on the internet, and every member's page
 * would then fetch it. An allowlist of one host makes that impossible to
 * express.
 *
 * `next.config.ts` allows the same host to the image optimizer. Both are
 * needed: this one decides what may be *stored*, that one what may be *fetched*.
 */
const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

export function isStoredImageUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  return (
    url.protocol === "https:" &&
    url.hostname.endsWith(BLOB_HOST_SUFFIX) &&
    // A bare ".public.blob.vercel-storage.com" has no store id in front of it,
    // and `endsWith` alone would accept it.
    url.hostname.length > BLOB_HOST_SUFFIX.length
  );
}
