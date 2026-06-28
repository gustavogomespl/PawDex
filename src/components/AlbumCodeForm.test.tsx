import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useRouter } from "next/navigation";
import { AlbumCodeForm } from "./AlbumCodeForm";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}));

describe("AlbumCodeForm", () => {
  it("opens the invite page for the typed album code", async () => {
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({
      push,
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
    });
    const user = userEvent.setup();

    render(<AlbumCodeForm />);

    await user.type(screen.getByLabelText("Codigo do album"), " ABC123 ");
    await user.click(screen.getByRole("button", { name: "Abrir convite" }));

    expect(push).toHaveBeenCalledWith("/join/ABC123");
  });
});
