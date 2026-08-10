// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShareDialog from "./share-dialog";

afterEach(cleanup);

const setup = (memberCount = 2) =>
  render(
    <ShareDialog cookbookTitle="Weeknight Dinners" memberCount={memberCount}>
      <p>panel contents</p>
    </ShareDialog>,
  );

const dialog = () => document.querySelector("dialog") as HTMLDialogElement;

describe("ShareDialog", () => {
  it("starts closed", () => {
    setup();

    expect(dialog().open).toBe(false);
  });

  it("opens on the Share button", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole("button", { name: /share/i }));

    expect(dialog().open).toBe(true);
  });

  it("names the cookbook it's sharing", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole("button", { name: /share/i }));

    expect(
      screen.getByRole("heading", { name: /Weeknight Dinners/ }),
    ).toBeInTheDocument();
  });

  it("closes on the close button", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole("button", { name: /share/i }));
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(dialog().open).toBe(false);
  });

  it("closes on Done", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole("button", { name: /share/i }));
    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(dialog().open).toBe(false);
  });

  // Escape is handled by the browser, which fires `close` — the component has
  // to hear that or its state desyncs from the DOM and reopening breaks.
  it("stays reopenable after the dialog closes itself", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole("button", { name: /share/i }));
    dialog().close();
    await user.click(screen.getByRole("button", { name: /share/i }));

    expect(dialog().open).toBe(true);
  });

  // Content is server-rendered and always present, which is what makes opening
  // instant — no fetch between the click and the dialog.
  it("renders its panel without waiting to be opened", () => {
    setup();

    expect(screen.getByText("panel contents")).toBeInTheDocument();
  });

  it("shows the member count once there's more than one", () => {
    setup(3);

    expect(screen.getByRole("button", { name: /share/i })).toHaveTextContent(
      "3",
    );
  });

  it("omits the count for a cookbook of one", () => {
    setup(1);

    expect(
      screen.getByRole("button", { name: /share/i }),
    ).not.toHaveTextContent("1");
  });
});
