import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PAWDEX_STORAGE_KEY } from "@/domain/pawdex/storage";
import { demoState } from "@/domain/pawdex/seed";
import { PawDexApp } from "./PawDexApp";

describe("PawDexApp", () => {
  it("renders the seeded album home", () => {
    render(<PawDexApp />);

    expect(
      screen.getByRole("heading", { name: "Escritorio Centro" }),
    ).toBeInTheDocument();
    expect(screen.getByText("7/12 encontrados")).toBeInTheDocument();
    expect(screen.getAllByText("Mingau").length).toBeGreaterThan(0);
  });

  it("loads existing local storage state instead of overwriting it with seed data", async () => {
    const savedState = {
      ...demoState,
      animals: [
        ...demoState.animals,
        {
          ...demoState.animals[0],
          id: "animal-saved-nina",
          displayName: "Saved Nina",
          lastSeenAt: "2026-06-27T09:00:00.000Z",
        },
      ],
      albumSlots: demoState.albumSlots.map((slot) =>
        slot.slotNumber === 8
          ? {
              ...slot,
              animalId: "animal-saved-nina",
              isDiscovered: true,
            }
          : slot,
      ),
    };
    window.localStorage.setItem(PAWDEX_STORAGE_KEY, JSON.stringify(savedState));

    render(<PawDexApp />);

    expect((await screen.findAllByText("Saved Nina")).length).toBeGreaterThan(0);
    expect(screen.getByText("8/12 encontrados")).toBeInTheDocument();
  });

  it("adds a sighting to an existing animal", async () => {
    const user = userEvent.setup();
    render(<PawDexApp />);

    await user.click(
      screen.getByRole("button", { name: /registrar avistamento/i }),
    );
    await user.upload(
      screen.getByLabelText(/enviar imagem/i),
      new File(["pet"], "pet.png", { type: "image/png" }),
    );
    await user.click(
      await screen.findByRole("button", { name: /confirmar como pretinha/i }),
    );

    expect(
      screen.queryByLabelText("Registrar avistamento"),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/avistamento salvo/i)).toBeInTheDocument();
  });

  it("creates a new animal from the composer", async () => {
    const user = userEvent.setup();
    render(<PawDexApp />);

    await user.click(
      screen.getByRole("button", { name: /registrar avistamento/i }),
    );
    await user.upload(
      screen.getByLabelText(/enviar imagem/i),
      new File(["pet"], "pet.png", { type: "image/png" }),
    );
    await user.type(screen.getByLabelText(/nome do animal/i), "Nina");
    await user.click(screen.getByRole("button", { name: /cadastrar novo/i }));

    expect(screen.getAllByText("Nina").length).toBeGreaterThan(0);
    expect(screen.getByText("8/12 encontrados")).toBeInTheDocument();
  });
});
