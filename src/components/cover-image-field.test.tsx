// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CoverImageField from "./cover-image-field";
import { upload } from "@vercel/blob/client";

// The real one talks to Vercel. What matters here is what we ask it for.
vi.mock("@vercel/blob/client", () => ({ upload: vi.fn() }));

const uploadMock = vi.mocked(upload);

const BLOB = "https://abc123.public.blob.vercel-storage.com/cookbook-covers/a.jpg";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  uploadMock.mockResolvedValue({ url: BLOB } as Awaited<ReturnType<typeof upload>>);
});

function imageFile(name = "cover.jpg", type = "image/jpeg", size = 1024) {
  const file = new File(["x"], name, { type });
  // Writing a real 9 MB buffer just to check a comparison would be silly.
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("CoverImageField — empty", () => {
  it("says there is no cover yet", () => {
    render(<CoverImageField value="" onChange={() => {}} />);

    expect(screen.getByText("No cover")).toBeInTheDocument();
    expect(screen.getByLabelText("Choose image")).toBeInTheDocument();
  });

  it("offers no Remove button when there is nothing to remove", () => {
    render(<CoverImageField value="" onChange={() => {}} />);

    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });
});

describe("CoverImageField — uploading", () => {
  it("sends the file to our own upload route, publicly readable", async () => {
    const user = userEvent.setup();
    render(<CoverImageField value="" onChange={() => {}} />);

    await user.upload(screen.getByLabelText("Choose image"), imageFile());

    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
    const [pathname, , options] = uploadMock.mock.calls[0];
    // The route handler refuses anything outside this prefix.
    expect(pathname).toBe("cookbook-covers/cover.jpg");
    expect(options.access).toBe("public");
    expect(options.handleUploadUrl).toBe("/api/cookbooks/cover");
  });

  it("hands the resulting URL to the parent form", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CoverImageField value="" onChange={onChange} />);

    await user.upload(screen.getByLabelText("Choose image"), imageFile());

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(BLOB));
  });

  // The parent disables its submit button on this, so a cookbook can't be
  // saved without the cover that is still arriving.
  it("tells the parent while an upload is in flight, and when it ends", async () => {
    const user = userEvent.setup();
    const onUploadingChange = vi.fn();
    render(
      <CoverImageField
        value=""
        onChange={() => {}}
        onUploadingChange={onUploadingChange}
      />,
    );

    await user.upload(screen.getByLabelText("Choose image"), imageFile());

    await waitFor(() =>
      expect(onUploadingChange.mock.calls).toEqual([[true], [false]]),
    );
  });

  it("names the file safely, whatever the phone called it", async () => {
    const user = userEvent.setup();
    render(<CoverImageField value="" onChange={() => {}} />);

    await user.upload(
      screen.getByLabelText("Choose image"),
      imageFile("My Photo (1)!.JPG"),
    );

    await waitFor(() => expect(uploadMock).toHaveBeenCalled());
    expect(uploadMock.mock.calls[0][0]).toBe("cookbook-covers/my-photo-1-.jpg");
  });

  it("explains a failed upload without repeating the API's wording", async () => {
    const user = userEvent.setup();
    uploadMock.mockRejectedValue(new Error("No token found for store_abc123"));
    render(<CoverImageField value="" onChange={() => {}} />);

    await user.upload(screen.getByLabelText("Choose image"), imageFile());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("That didn't upload. Try again?");
    expect(alert).not.toHaveTextContent("store_abc123");
  });
});

describe("CoverImageField — refusing a file before it leaves the browser", () => {
  it("refuses an image over 8 MB", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CoverImageField value="" onChange={onChange} />);

    await user.upload(
      screen.getByLabelText("Choose image"),
      imageFile("huge.jpg", "image/jpeg", 9 * 1024 * 1024),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("larger than 8 MB");
    expect(uploadMock).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("refuses a file that isn't an image we serve", async () => {
    // applyAccept:false so the test can hand the input a file the picker's
    // `accept` filter would normally hide. That filter is a convenience, not a
    // guarantee — a drag-and-drop, or "All files" in the picker, gets past it,
    // which is why the component checks the type itself.
    const user = userEvent.setup({ applyAccept: false });
    render(<CoverImageField value="" onChange={() => {}} />);

    await user.upload(
      screen.getByLabelText("Choose image"),
      imageFile("recipe.pdf", "application/pdf"),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /JPEG, PNG, WebP, AVIF or GIF/,
    );
    expect(uploadMock).not.toHaveBeenCalled();
  });
});

describe("CoverImageField — with a cover", () => {
  it("shows the image and offers to replace or remove it", () => {
    render(<CoverImageField value={BLOB} onChange={() => {}} />);

    expect(screen.getByLabelText("Replace image")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    expect(screen.queryByText("No cover")).toBeNull();
  });

  // Decorative: the form field is labelled, and the cookbook is named beside it.
  it("gives the preview an empty alt", () => {
    const { container } = render(
      <CoverImageField value={BLOB} onChange={() => {}} />,
    );

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("alt")).toBe("");
  });

  it("clears the cover without touching the upload route", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CoverImageField value={BLOB} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(onChange).toHaveBeenCalledWith("");
    expect(uploadMock).not.toHaveBeenCalled();
  });
});
