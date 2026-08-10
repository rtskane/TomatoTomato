// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RoleRow from "./role-row";
import type { MemberActionState } from "./actions";
import type { CookbookRole } from "@/generated/prisma/enums";

afterEach(cleanup);

type Action = (
  state: MemberActionState,
  formData: FormData,
) => Promise<MemberActionState>;

const noop: Action = async () => ({});

function setup({
  role = "VIEWER" as CookbookRole,
  changeRoleAction = noop,
  removeAction = noop,
  editable = true,
} = {}) {
  return render(
    <RoleRow
      name="alice"
      idField="userId"
      id="u_alice"
      role={role}
      editable={editable}
      changeRoleAction={changeRoleAction}
      removeAction={removeAction}
      removeLabel="Remove"
    />,
  );
}

const roleSelect = () => screen.getByLabelText("Role for alice");

describe("RoleRow", () => {
  it("shows the role the server reports", () => {
    setup({ role: "EDITOR" });

    expect(roleSelect()).toHaveValue("EDITOR");
  });

  it("submits the new role and the row's id", async () => {
    const user = userEvent.setup();
    const action = vi.fn<Action>(async () => ({}));
    setup({ changeRoleAction: action });

    await user.selectOptions(roleSelect(), "EDITOR");

    const formData = action.mock.calls[0][1];
    expect(formData.get("role")).toBe("EDITOR");
    expect(formData.get("userId")).toBe("u_alice");
  });

  // The regression this file exists for. As an uncontrolled <select> the value
  // snapped back to its mount-time default after the action, so a role change
  // that had already been written to the database looked like it had failed.
  it("keeps the new role after the action settles", async () => {
    const user = userEvent.setup();
    setup({ changeRoleAction: async () => ({}) });

    await user.selectOptions(roleSelect(), "EDITOR");

    // Asserting immediately would prove nothing: the old bug reverted the value
    // when the action *finished*, not when it started. The select is disabled
    // while pending, so waiting for it to re-enable is waiting for settlement.
    await waitFor(() => expect(roleSelect()).toBeEnabled());
    expect(roleSelect()).toHaveValue("EDITOR");
  });

  it("reverts to the server's role when the action reports an error", async () => {
    const user = userEvent.setup();
    setup({
      role: "VIEWER",
      changeRoleAction: async () => ({ error: "You don't have permission." }),
    });

    await user.selectOptions(roleSelect(), "EDITOR");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You don't have permission.",
    );
    expect(roleSelect()).toHaveValue("VIEWER");
  });

  it("adopts a role changed elsewhere on the server", () => {
    const { rerender } = setup({ role: "VIEWER" });

    rerender(
      <RoleRow
        name="alice"
        idField="userId"
        id="u_alice"
        role={"EDITOR" as CookbookRole}
        editable
        changeRoleAction={noop}
        removeAction={noop}
        removeLabel="Remove"
      />,
    );

    expect(roleSelect()).toHaveValue("EDITOR");
  });

  it("submits the row's id when removing", async () => {
    const user = userEvent.setup();
    const action = vi.fn<Action>(async () => ({}));
    setup({ removeAction: action });

    await user.click(screen.getByRole("button", { name: "Remove alice" }));

    expect(action.mock.calls[0][1].get("userId")).toBe("u_alice");
  });

  // The owner's row, and every row for a viewer: read-only, no controls at all.
  it("renders the role as plain text when not editable", () => {
    setup({ role: "OWNER", editable: false });

    expect(screen.queryByLabelText("Role for alice")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove alice" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
  });

  it("uses the invite id field when it's an invite row", async () => {
    const user = userEvent.setup();
    const action = vi.fn<Action>(async () => ({}));
    render(
      <RoleRow
        name="bob"
        idField="inviteId"
        id="inv1"
        role={"VIEWER" as CookbookRole}
        editable
        changeRoleAction={action}
        removeAction={noop}
        removeLabel="Cancel"
      />,
    );

    await user.selectOptions(screen.getByLabelText("Role for bob"), "EDITOR");

    expect(action.mock.calls[0][1].get("inviteId")).toBe("inv1");
  });
});
