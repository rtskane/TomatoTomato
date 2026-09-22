// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import { render, screen, cleanup } from "@testing-library/react";
import { useJoinUrl } from "./copy-link";

afterEach(cleanup);

function Probe({ token }: { token: string | null }) {
  return <output>{useJoinUrl(token) || "(none)"}</output>;
}

describe("useJoinUrl", () => {
  // The server can't know which host the owner is on, so it renders no URL
  // rather than a wrong one; the browser fills it in after hydration.
  it("renders no URL on the server", () => {
    expect(renderToString(<Probe token="once" />)).toContain("(none)");
  });

  it("builds the link on this page's own host in the browser", () => {
    render(<Probe token="once" />);
    expect(screen.getByRole("status")).toHaveTextContent(`${window.location.origin}/join/once`);
  });

  it("has no URL for a link that's turned off", () => {
    render(<Probe token={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("(none)");
  });
});
