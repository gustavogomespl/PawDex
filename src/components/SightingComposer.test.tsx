import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { demoState } from "@/domain/pawdex/seed";
import { SightingComposer } from "./SightingComposer";

const suggestions = demoState.animals.slice(0, 2);

describe("SightingComposer", () => {
  it("uploads an image and confirms an existing animal match", async () => {
    const user = userEvent.setup();
    const onAddToExisting = vi.fn();

    render(
      <SightingComposer
        suggestions={suggestions}
        onAddToExisting={onAddToExisting}
        onCreateNew={vi.fn()}
        onCancel={vi.fn()}
        onWarning={vi.fn()}
      />,
    );

    const file = new File(["pet"], "pet.png", { type: "image/png" });
    await user.upload(screen.getByLabelText(/enviar imagem/i), file);

    expect(await screen.findByAltText("Foto selecionada")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /confirmar como mingau/i }),
    );

    expect(onAddToExisting).toHaveBeenCalledWith(
      expect.objectContaining({
        animalId: "animal-mingau",
        photoUrl: expect.stringContaining("data:image/png"),
      }),
    );
  });

  it("creates a new animal from an uploaded image", async () => {
    const user = userEvent.setup();
    const onCreateNew = vi.fn();

    render(
      <SightingComposer
        suggestions={suggestions}
        onAddToExisting={vi.fn()}
        onCreateNew={onCreateNew}
        onCancel={vi.fn()}
        onWarning={vi.fn()}
      />,
    );

    const file = new File(["pet"], "pet.png", { type: "image/png" });
    await user.upload(screen.getByLabelText(/enviar imagem/i), file);
    await user.type(screen.getByLabelText(/nome do animal/i), "Nina");
    await user.selectOptions(screen.getByLabelText(/especie/i), "cat");
    await user.click(screen.getByRole("button", { name: /cadastrar novo/i }));

    expect(onCreateNew).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: "Nina",
        species: "cat",
        photoUrl: expect.stringContaining("data:image/png"),
      }),
    );
  });

  it("shows upload fallback when camera permission is denied", async () => {
    const user = userEvent.setup();
    const onWarning = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new Error("denied")),
      },
    });

    render(
      <SightingComposer
        suggestions={suggestions}
        onAddToExisting={vi.fn()}
        onCreateNew={vi.fn()}
        onCancel={vi.fn()}
        onWarning={onWarning}
      />,
    );

    await user.click(screen.getByRole("button", { name: /abrir camera/i }));

    expect(onWarning).toHaveBeenCalledWith(
      "Nao foi possivel abrir a camera. Use upload de imagem.",
    );
    expect(screen.getByLabelText(/enviar imagem/i)).toBeInTheDocument();
  });
});
