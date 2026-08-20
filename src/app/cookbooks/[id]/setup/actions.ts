"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOnboardedUser } from "@/lib/user";
import { deleteCoverImage } from "@/server/blob";
import { updateCookbook } from "@/server/services/cookbook.service";
import { setupPath } from "@/lib/setup-steps";

// Thin adapter for step two of setup. `cookbookId` is bound server-side by the
// page, so a crafted POST can't retarget another cookbook, and the service
// re-checks ownership regardless.

export type SetupCoverState = { error?: string };

/**
 * Save the designed cover and move on to the invitations.
 *
 * The title and description are read from the cookbook rather than the form:
 * this screen doesn't show them, and `updateCookbook` validates the whole
 * cookbook at once. Passing the stored title back through keeps that one
 * validation path rather than adding a cover-only variant of it.
 */
export async function saveSetupCoverAction(
  cookbookId: string,
  title: string,
  description: string,
  _prevState: SetupCoverState,
  formData: FormData,
): Promise<SetupCoverState> {
  const user = await requireOnboardedUser();

  const result = await updateCookbook(user.id, cookbookId, {
    title,
    description,
    coverImageUrl: String(formData.get("coverImageUrl") ?? ""),
    coverColor: String(formData.get("coverColor") ?? ""),
    coverStyle: String(formData.get("coverStyle") ?? ""),
    coverTexture: String(formData.get("coverTexture") ?? ""),
    coverTitleFont: String(formData.get("coverTitleFont") ?? ""),
    coverTitleSize: String(formData.get("coverTitleSize") ?? ""),
    coverTitlePosition: String(formData.get("coverTitlePosition") ?? ""),
    coverFocalX: String(formData.get("coverFocalX") ?? ""),
    coverFocalY: String(formData.get("coverFocalY") ?? ""),
    coverZoom: String(formData.get("coverZoom") ?? ""),
  });

  if (!result.ok) return { error: result.error.message };

  // Swapping or removing a cover leaves the old file behind. Best-effort, and
  // never fails the save that already succeeded.
  await deleteCoverImage(result.value.orphanedCover);

  revalidatePath("/dashboard");
  revalidatePath(`/cookbooks/${cookbookId}`);
  redirect(setupPath(cookbookId, "invite"));
}
