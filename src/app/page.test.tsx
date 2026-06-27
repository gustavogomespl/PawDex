import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoState } from "@/domain/pawdex/seed";
import Page from "./page";

describe("Page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the PawDex app shell", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(demoState), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    render(<Page />);

    expect(
      await screen.findByRole("heading", { name: "Escritorio Centro" }),
    ).toBeInTheDocument();
  });
});
