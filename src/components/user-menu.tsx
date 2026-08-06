"use client";

import { UserButton } from "@clerk/nextjs";

// Clerk's dropdown, with our own entries added. A client component of its own
// rather than inline in the (server) site header: the menu items are registered
// by Clerk through React context, so they need to live inside the client
// boundary alongside the button itself.

function LibraryIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export default function UserMenu() {
  return (
    <UserButton>
      <UserButton.MenuItems>
        <UserButton.Link
          href="/dashboard"
          label="Your library"
          labelIcon={<LibraryIcon />}
        />
        <UserButton.Link
          href="/cookbooks/new"
          label="New cookbook"
          labelIcon={<PlusIcon />}
        />
        {/* Listing the built-ins explicitly puts them *after* our entries;
            omitting them here would drop them from the menu entirely. */}
        <UserButton.Action label="manageAccount" />
        <UserButton.Action label="signOut" />
      </UserButton.MenuItems>
    </UserButton>
  );
}
