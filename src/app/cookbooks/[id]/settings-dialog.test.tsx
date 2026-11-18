// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsDialog from "./settings-dialog";
import { coverDesign } from "@/components/book-cover";

vi.mock("@vercel/blob/client", () => ({ upload: vi.fn() }));

afterEach(cleanup);

const impact = { title: "Weeknight Dinners", recipeCount: 0, recipesByOthers: 0, memberCount: 1 };

function renderDialog(
  updateAction: React.ComponentProps<typeof SettingsDialog>["updateAction"] = vi.fn(
    async () => ({}),
  ),
) {
  const view = render(
    <SettingsDialog
      title="Weeknight Dinners"
      description={null}
      design={coverDesign(2)}
      updateAction={updateAction}
      archiveAction={vi.fn(async () => ({}))}
      impact={impact}
    />,
  );
  const field = (name: string) =>
    view.container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  return { ...view, field };
}

const editor = () => screen.getByRole("dialog", { name: "Cover editor" });

describe("SettingsDialog — the cover", () => {
  // The cover is state, not controls: it posts through hidden fields, one per
  // part of the design, exactly as the service expects them.
  // An older cover: its title on the plate, nothing placed. Saving the
  // settings without opening the editor must post it back exactly as it is.
  it("posts the cover the cookbook already has", () => {
    const { field } = renderDialog();

    expect(field("coverColor").value).toBe("2");
    expect(field("coverStyle").value).toBe("TITLED");
    expect(field("coverElements").value).toBe("[]");
  });

  it("posts the cover the editor handed back, and says it isn't saved yet", async () => {
    const user = userEvent.setup();
    const { field } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "Edit cover" }));
    await user.click(within(editor()).getByRole("button", { name: "Oxblood" }));
    await user.click(within(editor()).getByRole("button", { name: "Done" }));

    expect(screen.queryByRole("dialog", { name: "Cover editor" })).toBeNull();
    expect(field("coverColor").value).toBe("6");
    // Closing the editor looks finished and isn't: the save is still to come.
    expect(screen.getByRole("status")).toHaveTextContent("Save changes to keep it");
  });

  // An older cover's title plate becomes elements in the editor; saving
  // stores them, so the title stays where the plate had it.
  it("stores an older cover's title as an element once it has been edited", async () => {
    const user = userEvent.setup();
    const { field } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "Edit cover" }));
    await user.click(within(editor()).getByRole("button", { name: "Oxblood" }));
    await user.click(within(editor()).getByRole("button", { name: "Done" }));

    const elements = JSON.parse(field("coverElements").value) as { role?: string }[];
    expect(elements.filter((e) => e.role === "title")).toHaveLength(1);
    expect(field("coverStyle").value).toBe("TITLED");
  });

  it("leaves the cover alone when the editor is closed untouched", async () => {
    const user = userEvent.setup();
    const { field } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "Edit cover" }));
    await user.click(within(editor()).getByRole("button", { name: "Done" }));

    expect(field("coverElements").value).toBe("[]");
    expect(screen.queryByRole("status")).toBeNull();
  });

  // The name is on the cover, so the editor can change it — and the title
  // field here has to follow, because that is the field that posts.
  it("takes a rename made in the editor back into the title field", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "Edit cover" }));
    await user.type(within(editor()).getByRole("textbox", { name: "Cookbook name" }), " II");
    await user.click(within(editor()).getByRole("button", { name: "Done" }));

    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Weeknight Dinners II");
  });

  describe("the note that the cover isn't saved yet", () => {
    async function changeCover(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole("button", { name: "Settings" }));
      await user.click(screen.getByRole("button", { name: "Edit cover" }));
      await user.click(within(editor()).getByRole("button", { name: "Oxblood" }));
      await user.click(within(editor()).getByRole("button", { name: "Done" }));
    }

    it("goes once the save has gone through, and the cover it posted was the new one", async () => {
      const user = userEvent.setup();
      const updateAction = vi.fn(async (_state: unknown, _form: FormData) => ({}));
      renderDialog(updateAction);

      await changeCover(user);
      await user.click(screen.getByRole("button", { name: "Save changes" }));

      await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
      expect(updateAction.mock.calls[0][1].get("coverColor")).toBe("6");
    });

    // A refused save leaves the new cover still waiting. The note has to keep
    // saying so, or the cover looks saved when it isn't.
    it("stays when the save is refused", async () => {
      const user = userEvent.setup();
      renderDialog(vi.fn(async () => ({ error: "Give your cookbook a title." })));

      await changeCover(user);
      await user.click(screen.getByRole("button", { name: "Save changes" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Give your cookbook a title.");
      expect(screen.getByRole("status")).toHaveTextContent("Save changes to keep it");
    });
  });
});
