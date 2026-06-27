import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { detectPetImage } from "@/domain/detection/client";
import { demoState } from "@/domain/pawdex/seed";
import { SightingComposer } from "./SightingComposer";

vi.mock("@/domain/detection/client", () => ({
  detectPetImage: vi.fn(),
}));

const detectPetImageMock = vi.mocked(detectPetImage);
const suggestions = demoState.animals.slice(0, 2);
const emptyDetection = { detections: [], bestDetection: null };

describe("SightingComposer", () => {
  beforeEach(() => {
    detectPetImageMock.mockResolvedValue(emptyDetection);
  });

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

  it("shows a successful dog detection and defaults new animal species", async () => {
    const user = userEvent.setup();
    detectPetImageMock.mockResolvedValue({
      detections: [
        {
          species: "dog",
          label: "dog",
          confidence: 0.87,
          box: { x1: 5, y1: 6, x2: 70, y2: 80 },
        },
      ],
      bestDetection: {
        species: "dog",
        label: "dog",
        confidence: 0.87,
        box: { x1: 5, y1: 6, x2: 70, y2: 80 },
      },
    });

    render(
      <SightingComposer
        suggestions={suggestions}
        onAddToExisting={vi.fn()}
        onCreateNew={vi.fn()}
        onCancel={vi.fn()}
        onWarning={vi.fn()}
      />,
    );

    await user.upload(
      screen.getByLabelText(/enviar imagem/i),
      new File(["pet"], "pet.png", { type: "image/png" }),
    );

    expect(await screen.findByText("Cachorro detectado, 87%")).toBeInTheDocument();
    expect(screen.getByLabelText(/especie/i)).toHaveValue("dog");
    expect(screen.getByTestId("detection-box")).toBeInTheDocument();
  });

  it("shows an empty detection state", async () => {
    const user = userEvent.setup();

    render(
      <SightingComposer
        suggestions={suggestions}
        onAddToExisting={vi.fn()}
        onCreateNew={vi.fn()}
        onCancel={vi.fn()}
        onWarning={vi.fn()}
      />,
    );

    await user.upload(
      screen.getByLabelText(/enviar imagem/i),
      new File(["pet"], "pet.png", { type: "image/png" }),
    );

    expect(
      await screen.findByText("Nenhum gato ou cachorro detectado."),
    ).toBeInTheDocument();
  });

  it("keeps manual flow available when detection fails", async () => {
    const user = userEvent.setup();
    const onWarning = vi.fn();
    detectPetImageMock.mockRejectedValue(new Error("offline"));

    render(
      <SightingComposer
        suggestions={suggestions}
        onAddToExisting={vi.fn()}
        onCreateNew={vi.fn()}
        onCancel={vi.fn()}
        onWarning={onWarning}
      />,
    );

    await user.upload(
      screen.getByLabelText(/enviar imagem/i),
      new File(["pet"], "pet.png", { type: "image/png" }),
    );

    expect(
      await screen.findByText("Nao foi possivel analisar a imagem agora."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/nome do animal/i)).toBeInTheDocument();
    expect(onWarning).toHaveBeenCalledWith(
      "Nao foi possivel analisar a imagem agora.",
    );
  });
});
