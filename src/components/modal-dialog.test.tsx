// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ModalDialog from "./modal-dialog";

afterEach(cleanup);

describe("ModalDialog", () => {
  // React delivers a nested dialog's `close` to its ancestors' handlers. The
  // cover editor opens over cookbook settings, and when settings took that
  // event as its own it shut — leaving the editor open inside a closed dialog,
  // on screen as nothing at all.
  it("stays open when a dialog opened from inside it closes", async () => {
    const user = userEvent.setup();
    render(
      <ModalDialog title="Cookbook settings" triggerContent="Settings" triggerClassName="">
        <dialog aria-label="Inner" open />
      </ModalDialog>,
    );

    await user.click(screen.getByRole("button", { name: "Settings" }));
    const outer = screen.getByRole("dialog", { name: "Cookbook settings" });
    expect(outer).toHaveAttribute("open");

    fireEvent(screen.getByRole("dialog", { name: "Inner" }), new Event("close"));
    expect(outer).toHaveAttribute("open");
  });

  it("closes on its own close", async () => {
    const user = userEvent.setup();
    render(
      <ModalDialog title="Cookbook settings" triggerContent="Settings" triggerClassName="">
        <p>Body</p>
      </ModalDialog>,
    );

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog", { name: "Cookbook settings" })).toBeNull();
  });
});
