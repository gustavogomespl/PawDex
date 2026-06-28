import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

import { redirect } from "next/navigation";
import Page from "./page";

describe("Page", () => {
  it("redirects to the places list", () => {
    Page();
    expect(redirect).toHaveBeenCalledWith("/places");
  });
});
