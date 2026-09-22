// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const { redirect, ensureUser, previewJoinLink } = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  ensureUser: vi.fn(),
  previewJoinLink: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/user", () => ({ ensureUser }));
vi.mock("@/server/services/member.service", () => ({ previewJoinLink }));
// The action module is "use server"; the page only binds it.
vi.mock("./actions", () => ({ joinWithLinkAction: vi.fn() }));

import JoinPage, { generateMetadata } from "./page";
import { DEFAULT_COVER_DESIGN } from "@/lib/book-covers";

afterEach(cleanup);

const preview = {
  cookbookId: "cb1",
  title: "Weeknight Dinners",
  description: "What we actually cook.",
  design: { ...DEFAULT_COVER_DESIGN, coverColor: 1 },
  role: "EDITOR" as const,
  ownerName: "ryan",
  memberCount: 3,
  alreadyMember: false,
  singleUse: false,
};

const params = (token = "tok") => ({ params: Promise.resolve({ token }) });
const renderPage = async (token?: string) => render(await JoinPage(params(token)));

beforeEach(() => {
  vi.clearAllMocks();
  ensureUser.mockResolvedValue(null);
  previewJoinLink.mockResolvedValue(preview);
});

describe("JoinPage — signed out", () => {
  it("shows what the link opens and the role on offer", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { name: "Weeknight Dinners" })).toBeInTheDocument();
    expect(screen.getByText(/ryan invited you to join/)).toBeInTheDocument();
    expect(screen.getByText(/join as an editor/)).toBeInTheDocument();
    expect(screen.getByText(/2 other people are already in it/)).toBeInTheDocument();
  });

  // Sign-up and sign-in both have to bring them back here to press Join.
  it("sends them to sign up or sign in, and back to this link afterwards", async () => {
    await renderPage("abc_123");

    expect(screen.getByRole("link", { name: "Sign up to join" })).toHaveAttribute(
      "href",
      "/sign-up?redirect_url=%2Fjoin%2Fabc_123",
    );
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in?redirect_url=%2Fjoin%2Fabc_123",
    );
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("JoinPage — signed in", () => {
  it("offers Join to a member-to-be", async () => {
    ensureUser.mockResolvedValue({ id: "u2", username: "mum" });

    await renderPage();

    expect(screen.getByRole("button", { name: "Join Weeknight Dinners" })).toBeInTheDocument();
    expect(previewJoinLink).toHaveBeenCalledWith("tok", "u2");
  });

  it("sends someone without a username through onboarding, then back", async () => {
    ensureUser.mockResolvedValue({ id: "u2", username: null });

    await expect(renderPage("abc_123")).rejects.toThrow(
      "REDIRECT:/onboarding?next=%2Fjoin%2Fabc_123",
    );
  });

  it("takes someone already in the cookbook straight to it", async () => {
    ensureUser.mockResolvedValue({ id: "owner1", username: "ryan" });
    previewJoinLink.mockResolvedValue({ ...preview, alreadyMember: true });

    await expect(renderPage()).rejects.toThrow("REDIRECT:/cookbooks/cb1");
  });

  it("describes a viewer's role as reading, and a lone owner without a count", async () => {
    ensureUser.mockResolvedValue({ id: "u2", username: "mum" });
    previewJoinLink.mockResolvedValue({ ...preview, role: "VIEWER", memberCount: 1 });

    await renderPage();

    expect(screen.getByText(/join as a viewer, so you can read every recipe in it\.$/)).toBeInTheDocument();
  });

  it("leaves out the description when there isn't one", async () => {
    previewJoinLink.mockResolvedValue({ ...preview, description: null });
    await renderPage();
    expect(screen.queryByText("What we actually cook.")).toBeNull();
  });

  it("says when a link works only once", async () => {
    previewJoinLink.mockResolvedValue({ ...preview, singleUse: true });
    await renderPage();
    expect(screen.getByText(/stops working once it.s used/)).toBeInTheDocument();
  });

  it("says nothing about single use for the cookbook's shared link", async () => {
    await renderPage();
    expect(screen.queryByText(/stops working once/)).toBeNull();
  });

  it("counts one other person in the singular", async () => {
    previewJoinLink.mockResolvedValue({ ...preview, memberCount: 2 });
    await renderPage();
    expect(screen.getByText(/1 other person is already in it/)).toBeInTheDocument();
  });
});

describe("JoinPage — a dead link", () => {
  // Unknown, turned off, reset, or archived: all the same to the holder.
  it("explains, and points a stranger home", async () => {
    previewJoinLink.mockResolvedValue(null);

    await renderPage();

    expect(screen.getByRole("heading", { name: /doesn.t work any more/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to the home page" })).toHaveAttribute("href", "/");
  });

  it("points a signed-in user at their library instead", async () => {
    ensureUser.mockResolvedValue({ id: "u2", username: "mum" });
    previewJoinLink.mockResolvedValue(null);

    await renderPage();

    expect(screen.getByRole("link", { name: "Go to your library" })).toHaveAttribute("href", "/dashboard");
  });
});

describe("JoinPage — metadata", () => {
  it("names the cookbook, and keeps the page out of search", async () => {
    const meta = await generateMetadata(params());
    expect(meta.title).toBe("Join Weeknight Dinners");
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it("stays generic for a dead link", async () => {
    previewJoinLink.mockResolvedValue(null);
    expect((await generateMetadata(params())).title).toBe("Invite link");
  });
});
