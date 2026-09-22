// The rules for an uploaded image, shared by the field that sends one and the
// route that issues permission to. The route is what enforces them; the field
// checks the same limits first only so a wrong file gets a clear message
// instantly instead of a failed upload.

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
