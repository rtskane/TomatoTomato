// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CoverDesigner from "./cover-designer";
import { upload } from "@vercel/blob/client";

// The real one talks to Vercel. What matters here is what the designer does
// once a URL comes back.
vi.mock("@vercel/blob/client", () => ({ upload: vi.fn() }));

const uploadMock = vi.mocked(upload);

const BLOB =
  "https://abc123.public.blob.vercel-storage.com/cookbook-covers/a.jpg";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  uploadMock.mockResolvedValue({ url: BLOB } as Awaited<
    ReturnType<typeof upload>
  >);
});

function imageFile() {
  const file = new File(["x"], "cover.jpg", { type: "image/jpeg" });
  Object.defineProperty(file, "size", { value: 1024 });
  return file;
}

function renderDesigner(
  props: Partial<React.ComponentProps<typeof CoverDesigner>> = {},
) {
  return render(
    <CoverDesigner
      title="Weeknight Dinners"
      defaultCoverColor={2}
      defaultCoverStyle="TITLED"
      {...props}
    />,
  );
}

/** The book face itself — the element carrying the cloth colour. */
function face(container: HTMLElement) {
  return container.querySelector("[class*='bg-book-cover-']")!;
}

describe("CoverDesigner — the controls are the form fields", () => {
  // No hidden mirror of the radios: two representations of one choice is how
  // they end up disagreeing.
  it("posts the chosen colour and style under their own names", () => {
    const { container } = renderDesigner();

    const checkedColour = container.querySelector<HTMLInputElement>(
      'input[name="coverColor"]:checked',
    );
    const checkedStyle = container.querySelector<HTMLInputElement>(
      'input[name="coverStyle"]:checked',
    );

    expect(checkedColour!.value).toBe("2");
    expect(checkedStyle!.value).toBe("TITLED");
  });

  it("offers one swatch per cover, each named rather than numbered", () => {
    renderDesigner();

    // The name is what a screen reader announces — "colour 6" would be useless.
    expect(screen.getByRole("radio", { name: "Garnet" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Linen" })).toBeInTheDocument();
  });
});

describe("CoverDesigner — picking a colour", () => {
  it("repaints the preview and posts the new colour", async () => {
    const user = userEvent.setup();
    const { container } = renderDesigner();

    expect(face(container).className).toContain("bg-book-cover-2");

    await user.click(screen.getByRole("radio", { name: "Linen" }));

    expect(face(container).className).toContain("bg-book-cover-8");
    expect(
      container.querySelector<HTMLInputElement>(
        'input[name="coverColor"]:checked',
      )!.value,
    ).toBe("8");
  });
});

describe("CoverDesigner — picking a style", () => {
  it("drops the printed title when the cover goes Plain", async () => {
    const user = userEvent.setup();
    renderDesigner();

    expect(screen.getByText("Weeknight Dinners")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Plain" }));

    expect(screen.queryByText("Weeknight Dinners")).toBeNull();
  });

  // A control that accepts a choice it cannot honour is worse than one that
  // waits for the thing it needs.
  it("refuses Photo until there is a photo", () => {
    renderDesigner();
    expect(screen.getByRole("radio", { name: "Photo" })).toBeDisabled();
  });
});

describe("CoverDesigner — the preview is the real book", () => {
  it("shows the title as it is typed, not as it was saved", () => {
    const { rerender } = renderDesigner({ title: "Baking" });
    expect(screen.getByText("Baking")).toBeInTheDocument();

    rerender(
      <CoverDesigner
        title="Baking Bread"
        defaultCoverColor={2}
        defaultCoverStyle="TITLED"
      />,
    );
    expect(screen.getByText("Baking Bread")).toBeInTheDocument();
  });

  it("stands in a name for a cookbook that has none yet", () => {
    renderDesigner({ title: "   " });
    expect(screen.getByText("Untitled cookbook")).toBeInTheDocument();
  });
});

describe("CoverDesigner — the style follows the picture", () => {
  // Uploading and then saving onto the old colour cover, with no explanation,
  // is the trap this avoids.
  it("switches to Photo when an image finishes uploading", async () => {
    const user = userEvent.setup();
    const { container } = renderDesigner();

    await user.upload(screen.getByLabelText("Choose image"), imageFile());

    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "Photo" })).toBeChecked();
    });
    expect(container.querySelector("img")).not.toBeNull();
  });

  it("steps back off Photo when the image is removed", async () => {
    const user = userEvent.setup();
    const { container } = renderDesigner({
      defaultCoverStyle: "PHOTO",
      defaultCoverImageUrl: BLOB,
    });

    expect(screen.getByRole("radio", { name: "Photo" })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(screen.getByRole("radio", { name: "Titled" })).toBeChecked();
    expect(container.querySelector("img")).toBeNull();
    // And it is offered again only once there is another picture.
    expect(screen.getByRole("radio", { name: "Photo" })).toBeDisabled();
  });

  it("keeps the chosen colour behind the photo, ready for a switch back", async () => {
    const user = userEvent.setup();
    const { container } = renderDesigner({
      defaultCoverColor: 5,
      defaultCoverStyle: "PHOTO",
      defaultCoverImageUrl: BLOB,
    });

    await user.click(screen.getByRole("radio", { name: "Titled" }));

    expect(face(container).className).toContain("bg-book-cover-5");
    // The URL is still posted, so switching back to Photo needs no re-upload.
    expect(
      container.querySelector<HTMLInputElement>('input[name="coverImageUrl"]')!
        .value,
    ).toBe(BLOB);
  });
});

describe("CoverDesigner — telling the form when to wait", () => {
  it("reports an upload starting and finishing", async () => {
    const user = userEvent.setup();
    const onUploadingChange = vi.fn();
    renderDesigner({ onUploadingChange });

    await user.upload(screen.getByLabelText("Choose image"), imageFile());

    await waitFor(() => {
      expect(onUploadingChange).toHaveBeenCalledWith(false);
    });
    // Submitting mid-upload would save a cookbook without the picture.
    expect(onUploadingChange.mock.calls.map(([b]) => b)).toEqual([true, false]);
  });
});
