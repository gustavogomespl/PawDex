import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "user-1", email: "ana@empresa.com" } })),
}));

vi.mock("@/domain/places/server", () => ({
  fetchPlacesForUser: vi.fn(),
}));

import { fetchPlacesForUser } from "@/domain/places/server";
import PlacesPage from "./page";

describe("PlacesPage", () => {
  it("renders the user's places as album covers", async () => {
    vi.mocked(fetchPlacesForUser).mockResolvedValue([
      {
        id: "place-office",
        name: "Escritorio Centro",
        type: "office",
        privacyLevel: "invite-only",
        albumTotalSlots: 12,
        photoUrl: null,
        inviteCode: "ABC123",
        role: "admin",
      },
      {
        id: "place-campus",
        name: "Campus Verde",
        type: "campus",
        privacyLevel: "private",
        albumTotalSlots: 20,
        photoUrl: null,
        inviteCode: null,
        role: "member",
      },
    ]);

    render(await PlacesPage());

    expect(screen.getByRole("heading", { name: "Meus albuns" })).toBeInTheDocument();
    expect(screen.getByText("Escritorio Centro")).toBeInTheDocument();
    expect(screen.getByText("Campus Verde")).toBeInTheDocument();
    expect(screen.getByLabelText("Codigo do album")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir convite" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Abrir album" })).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Painel admin" })).toHaveAttribute(
      "href",
      "/places/place-office/admin",
    );
  });

  it("renders a useful empty album state", async () => {
    vi.mocked(fetchPlacesForUser).mockResolvedValue([]);

    render(await PlacesPage());

    expect(screen.getByText("Nenhum album criado ainda.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Criar primeiro album" })).toHaveAttribute(
      "href",
      "/places/new",
    );
  });
});
