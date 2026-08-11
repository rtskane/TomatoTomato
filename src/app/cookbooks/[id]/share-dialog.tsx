import ModalDialog from "@/components/modal-dialog";

// The Share button and its dialog. All the modal mechanics live in
// ModalDialog; this only decides what the trigger looks like and what goes
// inside — which means it stays a Server Component, and the members panel it
// wraps never crosses into a client bundle.
//
// Not an intercepting route, though Next.js supports one: a share dialog isn't
// a place, it's a control on the cookbook page, and Google Docs' own doesn't
// change the URL either. Routing it would also put a server round trip between
// the click and the dialog appearing, where the content is already on the page.
// `/cookbooks/[id]/members` still exists as a real page for deep links.

export default function ShareDialog({
  cookbookTitle,
  memberCount,
  children,
}: {
  cookbookTitle: string;
  memberCount: number;
  children: React.ReactNode;
}) {
  return (
    <ModalDialog
      title={`Share “${cookbookTitle}”`}
      triggerClassName="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/10"
      triggerContent={
        <>
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M19 8v6M22 11h-6" />
          </svg>
          Share
          {memberCount > 1 ? (
            <span className="text-black/40 dark:text-white/40">
              {memberCount}
            </span>
          ) : null}
        </>
      }
    >
      {children}
    </ModalDialog>
  );
}
