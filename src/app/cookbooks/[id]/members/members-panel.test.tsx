// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// The panel binds these to the cookbook; the controls' own tests cover them.
vi.mock("./actions", () => {
  const action = () => ({ bind: () => vi.fn(async () => ({})) });
  return {
    inviteMembersAction: action(),
    changeMemberRoleAction: action(),
    removeMemberAction: action(),
    changeInviteRoleAction: action(),
    cancelInviteAction: action(),
    setJoinLinkEnabledAction: action(),
    setJoinLinkRoleAction: action(),
    resetJoinLinkAction: action(),
    createOneTimeLinkAction: action(),
  };
});

import MembersPanel from "./members-panel";
import type { MembersView } from "@/server/services/member.service";

afterEach(cleanup);

const view = (overrides: Partial<MembersView> = {}): MembersView => ({
  cookbookId: "cb1",
  cookbookTitle: "Weeknight Dinners",
  canManageMembers: true,
  members: [
    { userId: "owner1", name: "ryan", avatarUrl: null, role: "OWNER", isOwner: true, isSelf: true },
  ],
  outstandingInvites: [],
  joinLink: { token: null, role: "VIEWER" },
  oneTimeLinks: [],
  ...overrides,
});

describe("MembersPanel — invite link", () => {
  it("gives the owner the link controls", () => {
    render(<MembersPanel view={view()} />);
    expect(screen.getByRole("switch", { name: "Invite link" })).toBeInTheDocument();
  });

  // The token is the permission to join; it isn't everyone's to hand out.
  it("shows nothing of the link to anyone else", () => {
    render(<MembersPanel view={view({ canManageMembers: false, joinLink: null })} />);
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByText("Invite link")).toBeNull();
  });
});

describe("MembersPanel — one-time links", () => {
  it("lets the owner make them, and lists the unused ones", () => {
    render(
      <MembersPanel
        view={view({
          oneTimeLinks: [{ id: "inv9", token: "once", role: "EDITOR", label: "Mum", daysLeft: 6 }],
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "Create link" })).toBeInTheDocument();
    expect(screen.getByText("Mum")).toBeInTheDocument();
    // Not in the list of people: it names nobody.
    expect(screen.queryByText("Waiting to accept")).toBeNull();
  });

  it("shows no one else how to make or find them", () => {
    render(<MembersPanel view={view({ canManageMembers: false, joinLink: null })} />);
    expect(screen.queryByText("One-time links")).toBeNull();
    expect(screen.queryByRole("button", { name: "Create link" })).toBeNull();
  });
});
