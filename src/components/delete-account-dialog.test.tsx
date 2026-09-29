// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { signOut, loadAccountDeletionPreview, deleteAccountAction } = vi.hoisted(
  () => ({
    signOut: vi.fn(),
    loadAccountDeletionPreview: vi.fn(),
    deleteAccountAction: vi.fn(),
  }),
);
vi.mock("@clerk/nextjs", () => ({ useClerk: () => ({ signOut }) }));
vi.mock("@/app/account/actions", () => ({
  loadAccountDeletionPreview,
  deleteAccountAction,
}));

import DeleteAccountDialog from "./delete-account-dialog";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

const preview = { recipesElsewhere: 3 };

function setup() {
  return render(<DeleteAccountDialog open onClose={() => {}} />);
}

const deleteButton = () => screen.getByRole("button", { name: "Delete account" });

describe("DeleteAccountDialog", () => {
  it("says what happens to their cookbooks and asks about their recipes", async () => {
    loadAccountDeletionPreview.mockResolvedValue(preview);
    setup();

    expect(
      await screen.findByText(/Cookbooks you share pass to another member/),
    ).toBeInTheDocument();
    expect(screen.getByText(/You've written/)).toHaveTextContent("3 recipes");
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(deleteAccountAction).not.toHaveBeenCalled();
  });

  it("won't delete until they've said what happens to their recipes", async () => {
    const user = userEvent.setup();
    loadAccountDeletionPreview.mockResolvedValue(preview);
    deleteAccountAction.mockResolvedValue({});
    setup();

    await user.click(await screen.findByRole("button", { name: "Delete account" }));
    expect(deleteAccountAction).not.toHaveBeenCalled();

    await user.click(screen.getByRole("radio", { name: /Delete them/ }));
    await user.click(deleteButton());

    expect(deleteAccountAction).toHaveBeenCalledTimes(1);
    const formData = deleteAccountAction.mock.calls[0][1] as FormData;
    expect(formData.get("recipes")).toBe("delete");
  });

  it("doesn't ask about recipes when there are none in shared cookbooks", async () => {
    const user = userEvent.setup();
    loadAccountDeletionPreview.mockResolvedValue({ recipesElsewhere: 0 });
    deleteAccountAction.mockResolvedValue({});
    setup();

    await screen.findByRole("button", { name: "Delete account" });
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();

    await user.click(deleteButton());
    expect(deleteAccountAction).toHaveBeenCalledTimes(1);
  });

  it("signs them out once the account is gone", async () => {
    const user = userEvent.setup();
    loadAccountDeletionPreview.mockResolvedValue({ recipesElsewhere: 0 });
    deleteAccountAction.mockResolvedValue({ deleted: true });
    setup();

    await user.click(await screen.findByRole("button", { name: "Delete account" }));

    expect(signOut).toHaveBeenCalledWith({ redirectUrl: "/" });
    expect(screen.getByRole("button", { name: "Signing you out…" })).toBeDisabled();
  });

  it("shows the error and stays open when something fails", async () => {
    const user = userEvent.setup();
    loadAccountDeletionPreview.mockResolvedValue({ recipesElsewhere: 0 });
    deleteAccountAction.mockResolvedValue({ error: "Please try again." });
    setup();

    await user.click(await screen.findByRole("button", { name: "Delete account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Please try again.");
    expect(signOut).not.toHaveBeenCalled();
  });
});
