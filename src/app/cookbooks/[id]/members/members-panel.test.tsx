// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The panel binds these to the cookbook; the controls' own tests cover them.
vi.mock("./actions", () => {
  const action = () => ({ bind: () => vi.fn(async () => ({})) });
  return {
    changeMemberRoleAction: action(),
    removeMemberAction: action(),
    setJoinLinkEnabledAction: action(),
    setJoinLinkRoleAction: action(),
    resetJoinLinkAction: action(),
    createOneTimeLinkAction: action(),
    revokeOneTimeLinkAction: action(),
    leaveCookbookAction: action(),
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
  });

  it("shows no one else how to make or find them", () => {
    render(<MembersPanel view={view({ canManageMembers: false, joinLink: null })} />);
    expect(screen.queryByText("One-time links")).toBeNull();
    expect(screen.queryByRole("button", { name: "Create link" })).toBeNull();
  });
});

describe("MembersPanel — leaving", () => {
  const asMember = (role: "VIEWER" | "EDITOR") =>
    view({
      canManageMembers: false,
      joinLink: null,
      members: [
        { userId: "owner1", name: "ryan", avatarUrl: null, role: "OWNER", isOwner: true, isSelf: false },
        { userId: "u_alice", name: "alice", avatarUrl: null, role, isOwner: false, isSelf: true },
      ],
    });

  it("lets a member leave, once they confirm", async () => {
    const user = userEvent.setup();
    render(<MembersPanel view={asMember("VIEWER")} />);

    await user.click(screen.getByRole("button", { name: "Leave this cookbook" }));

    expect(screen.getByText("Leave “Weeknight Dinners”?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leave" })).toBeInTheDocument();
    // A viewer never added anything, so there's nothing to reassure them about.
    expect(screen.queryByText(/recipes you added/)).toBeNull();
  });

  it("tells an editor their recipes stay", async () => {
    const user = userEvent.setup();
    render(<MembersPanel view={asMember("EDITOR")} />);

    await user.click(screen.getByRole("button", { name: "Leave this cookbook" }));

    expect(screen.getByText(/Any recipes you added stay in it/)).toBeInTheDocument();
  });

  // Nobody would be left holding Cookbook.ownerId.
  it("offers the owner no way to leave", () => {
    render(<MembersPanel view={view()} />);
    expect(screen.queryByRole("button", { name: "Leave this cookbook" })).toBeNull();
  });
});
