"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOnboardedUser } from "@/lib/user";
import { deleteCoverImage, deleteImages } from "@/server/blob";
import {
  updateCookbook,
  archiveCookbook,
  restoreCookbook,
  deleteCookbookForever,
} from "@/server/services/cookbook.service";

// Thin adapter for the cookbook's own settings: rename, archive, restore, and
// delete for good.
// `cookbookId` is bound server-side by the page in every case, so a crafted
// POST can't retarget another cookbook. The service re-checks ownership.

export type UpdateCookbookState = {
  error?: string;
  values?: {
    title: string;
    description: string;
    coverImageUrl: string;
    coverColor: string;
    coverStyle: string;
    coverTexture: string;
    coverTitleFont: string;
    coverTitleSize: string;
    coverTitlePosition: string;
    coverFocalX: string;
    coverFocalY: string;
    coverZoom: string;
  };
};

export async function updateCookbookAction(
  cookbookId: string,
  _prevState: UpdateCookbookState,
  formData: FormData,
): Promise<UpdateCookbookState> {
  const user = await requireOnboardedUser();

  const values = {
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    coverImageUrl: String(formData.get("coverImageUrl") ?? ""),
    // Posted by the cover designer's radios. Empty when the request didn't
    // come from it at all, which the schema reads as "unchosen" rather than
    // as an error — see createCookbookSchema.
    coverColor: String(formData.get("coverColor") ?? ""),
    coverStyle: String(formData.get("coverStyle") ?? ""),
    coverTexture: String(formData.get("coverTexture") ?? ""),
    coverTitleFont: String(formData.get("coverTitleFont") ?? ""),
    coverTitleSize: String(formData.get("coverTitleSize") ?? ""),
    coverTitlePosition: String(formData.get("coverTitlePosition") ?? ""),
    coverFocalX: String(formData.get("coverFocalX") ?? ""),
    coverFocalY: String(formData.get("coverFocalY") ?? ""),
    coverZoom: String(formData.get("coverZoom") ?? ""),
  };

  const result = await updateCookbook(user.id, cookbookId, values);
  if (!result.ok) return { error: result.error.message, values };

  // Swapping or removing a cover leaves the old file behind. Deleting it here
  // rather than in the service keeps the network call out of the layer that is
  // meant to be testable without one; it is best-effort, and never fails the
  // save that already succeeded.
  await deleteCoverImage(result.value.orphanedCover);

  revalidatePath(`/cookbooks/${cookbookId}`);
  // The title is what the dashboard lists this cookbook by.
  revalidatePath("/dashboard");
  return { values };
}

export type ArchiveCookbookState = { error?: string };

export async function archiveCookbookAction(
  cookbookId: string,
  _prevState: ArchiveCookbookState,
  _formData: FormData,
): Promise<ArchiveCookbookState> {
  const user = await requireOnboardedUser();

  const result = await archiveCookbook(user.id, cookbookId);
  if (!result.ok) return { error: result.error.message };

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function restoreCookbookAction(
  cookbookId: string,
  _prevState: ArchiveCookbookState,
  _formData: FormData,
): Promise<ArchiveCookbookState> {
  const user = await requireOnboardedUser();

  const result = await restoreCookbook(user.id, cookbookId);
  if (!result.ok) return { error: result.error.message };

  revalidatePath("/dashboard");
  revalidatePath(`/cookbooks/${cookbookId}`);
  return {};
}

/** Only an archived cookbook — the service refuses a live one. */
export async function deleteCookbookForeverAction(
  cookbookId: string,
  _prevState: ArchiveCookbookState,
  _formData: FormData,
): Promise<ArchiveCookbookState> {
  const user = await requireOnboardedUser();

  const result = await deleteCookbookForever(user.id, cookbookId);
  if (!result.ok) return { error: result.error.message };

  // After the rows are gone, never before: a failed delete must not cost the
  // cookbook its pictures.
  await deleteImages(result.value.orphanedImages);

  revalidatePath("/dashboard");
  return {};
}
