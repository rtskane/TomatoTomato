import { del } from "@vercel/blob";

// The only module that deletes from blob storage. Kept out of the service
// layer so services stay callable in tests without a network.

/**
 * Delete a cover file that nothing points at any more — best-effort.
 *
 * Deliberately swallows its errors. This runs after the database write that
 * detached the file, so by the time it fails the user's save has already
 * succeeded; turning a failed cleanup into a failed save would be a strictly
 * worse trade. The cost of losing one is a few KB of storage, and `del` is
 * billed at nothing.
 */
export async function deleteCoverImage(url: string | null): Promise<void> {
  if (!url) return;

  try {
    await del(url);
  } catch (error) {
    console.error("[blob] failed to delete orphaned cover", url, error);
  }
}
