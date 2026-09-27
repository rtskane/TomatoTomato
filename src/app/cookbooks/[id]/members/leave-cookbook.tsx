"use client";

import InlineConfirm from "@/components/inline-confirm";
import type { MemberActionState } from "./actions";

// Taking yourself out of a cookbook, at the foot of the people list. Asks
// first, the same inline way archiving does in the settings dialog: coming
// back takes a link from the owner, and most people won't have one to hand.
//
// Never rendered for the owner — the panel decides that.

type LeaveAction = (
  state: MemberActionState,
  formData: FormData,
) => Promise<MemberActionState>;

export default function LeaveCookbook({
  cookbookTitle,
  canAddRecipes,
  action,
}: {
  cookbookTitle: string;
  /** Whether they could have added recipes — only then is there any to mention. */
  canAddRecipes: boolean;
  action: LeaveAction;
}) {
  return (
    <InlineConfirm
      action={action}
      triggerLabel="Leave this cookbook"
      title={`Leave “${cookbookTitle}”?`}
      confirmLabel="Leave"
      pendingLabel="Leaving…"
    >
      It leaves your library, and you&rsquo;ll need a link from the owner to
      come back.
      {canAddRecipes ? " Any recipes you added stay in it." : ""}
    </InlineConfirm>
  );
}
