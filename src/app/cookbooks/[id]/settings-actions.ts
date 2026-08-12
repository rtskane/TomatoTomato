"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOnboardedUser } from "@/lib/user";
import {
  updateCookbook,
  archiveCookbook,
  restoreCookbook,
} from "@/server/services/cookbook.service";

// Thin adapter for the cookbook's own settings: rename, archive, restore.
// `cookbookId` is bound server-side by the page in every case, so a crafted
// POST can't retarget another cookbook. The service re-checks ownership.

export type UpdateCookbookState = {
  error?: string;
  values?: { title: string; description: string };
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
  };

  const result = await updateCookbook(user.id, cookbookId, values);
  if (!result.ok) return { error: result.error.message, values };

  revalidatePath(`/cookbooks/${cookbookId}`);
  // The title is what the dashboard lists this cookbook by.
  revalidatePath("/dashboard");
  return { values };
}

export type ArchiveCookbookState = { error?: string };

/**
 * The typed name is checked server-side, not just in the dialog.
 *
 * A confirmation that only the client enforces isn't a confirmation — this
 * action is reachable by direct POST. Comparing here means the guard holds
 * however the request arrives.
 */
export async function archiveCookbookAction(
  cookbookId: string,
  expectedTitle: string,
  _prevState: ArchiveCookbookState,
  formData: FormData,
): Promise<ArchiveCookbookState> {
  const user = await requireOnboardedUser();

  const typed = String(formData.get("confirmTitle") ?? "").trim();
  if (typed !== expectedTitle.trim()) {
    return { error: "That doesn't match the cookbook's name." };
  }

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
