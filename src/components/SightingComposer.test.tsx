import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyzePetSighting } from "@/domain/matching/client";
import { SightingComposer } from "./SightingComposer";

vi.mock("@/domain/matching/client", () => ({
  analyzePetSighting: vi.fn(),
}));

const analyzePetSightingMock = vi.mocked(analyzePetSighting);
const placeId = "place-office-centro";
const defaultAnalyzeResponse = {
  analysisId: "analysis-1",
  detection: null,
  embedding: null,
  matches: [],
  recommendation: "no_pet_detected" as const,
};

function renderComposer(overrides = {}) {
  const props = {
    placeId,
    onAddToExisting: vi.fn(),
    onCreateNew: vi.fn(),
    onCancel: vi.fn(),
    onWarning: vi.fn(),
    ...overrides,
  };

  render(<SightingComposer {...props} />);

  return props;
}

describe("SightingComposer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    analyzePetSightingMock.mockResolvedValue(defaultAnalyzeResponse);
  });

  it("uploads an image, shows a vector match, and confirms an existing animal match", async () => {
    const user = userEvent.setup();
    analyzePetSightingMock.mockResolvedValue({
      analysisId: "analysis-match-1",
      detection: {
        species: "cat",
        label: "cat",
        confidence: 0.91,
        box: { x1: 5, y1: 6, x2: 70, y2: 80 },
      },
      embedding: { modelVersion: "clip-test", qualityScore: 0.82 },
      matches: [
        {
          animalId: "animal-mingau",
          displayName: "Mingau",
          species: "cat",
          primaryPhotoUrl: "/mingau.png",
          score: 0.86,
        },
      ],
      recommendation: "possible_existing",
    });
    const onAddToExisting = vi.fn();
    renderComposer({ onAddToExisting });

    const file = new File(["pet"], "pet.png", { type: "image/png" });
    await user.upload(screen.getByLabelText(/enviar imagem/i), file);

    expect(
      await screen.findByText("Parece ser Mingau, 86% de similaridade."),
    ).toBeInTheDocument();
    expect(screen.getByAltText("Foto selecionada")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /confirmar como mingau/i }),
    );

    expect(onAddToExisting).toHaveBeenCalledWith({
      analysisId: "analysis-match-1",
      animalId: "animal-mingau",
      photoUrl: expect.stringContaining("data:image/png"),
      matchConfidence: 0.86,
    });
  });

  it("creates a new animal from an uploaded image with the analysis id", async () => {
    const user = userEvent.setup();
    analyzePetSightingMock.mockResolvedValue({
      ...defaultAnalyzeResponse,
      analysisId: "analysis-new-1",
      detection: {
        species: "cat",
        label: "cat",
        confidence: 0.76,
        box: { x1: 1, y1: 2, x2: 40, y2: 50 },
      },
      recommendation: "probably_new",
    });
    const onCreateNew = vi.fn();
    renderComposer({ onCreateNew });

    const file = new File(["pet"], "pet.png", { type: "image/png" });
    await user.upload(screen.getByLabelText(/enviar imagem/i), file);
    await user.type(screen.getByLabelText(/nome do animal/i), "Nina");
    await user.selectOptions(screen.getByLabelText(/especie/i), "cat");
    await user.click(screen.getByRole("button", { name: /cadastrar novo/i }));

    expect(onCreateNew).toHaveBeenCalledWith({
      analysisId: "analysis-new-1",
      displayName: "Nina",
      species: "cat",
      photoUrl: expect.stringContaining("data:image/png"),
    });
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
    renderComposer({ onWarning });

    await user.click(screen.getByRole("button", { name: /abrir camera/i }));

    expect(onWarning).toHaveBeenCalledWith(
      "Nao foi possivel abrir a camera. Use upload de imagem.",
    );
    expect(screen.getByLabelText(/enviar imagem/i)).toBeInTheDocument();
  });

  it("shows a successful dog detection and defaults new animal species", async () => {
    const user = userEvent.setup();
    analyzePetSightingMock.mockResolvedValue({
      analysisId: "analysis-dog-1",
      detection: {
        species: "dog",
        label: "dog",
        confidence: 0.87,
        box: { x1: 5, y1: 6, x2: 70, y2: 80 },
      },
      embedding: { modelVersion: "clip-test", qualityScore: 0.75 },
      matches: [],
      recommendation: "probably_new",
    });
    renderComposer();

    await user.upload(
      screen.getByLabelText(/enviar imagem/i),
      new File(["pet"], "pet.png", { type: "image/png" }),
    );

    expect(await screen.findByText(/Cachorro detectado, 87%/)).toBeInTheDocument();
    expect(screen.getByLabelText(/especie/i)).toHaveValue("dog");
    expect(screen.getByTestId("detection-box")).toBeInTheDocument();
  });

  it("shows an empty detection state", async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.upload(
      screen.getByLabelText(/enviar imagem/i),
      new File(["pet"], "pet.png", { type: "image/png" }),
    );

    expect(
      await screen.findByText("Nenhum gato ou cachorro detectado."),
    ).toBeInTheDocument();
  });

  it("keeps manual flow available when matching fails", async () => {
    const user = userEvent.setup();
    const onWarning = vi.fn();
    analyzePetSightingMock.mockRejectedValue(new Error("offline"));
    renderComposer({ onWarning });

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

  it("shows probably-new recommendation text when there are no matches", async () => {
    const user = userEvent.setup();
    analyzePetSightingMock.mockResolvedValue({
      analysisId: "analysis-new-2",
      detection: {
        species: "cat",
        label: "cat",
        confidence: 0.79,
        box: { x1: 2, y1: 3, x2: 42, y2: 52 },
      },
      embedding: { modelVersion: "clip-test", qualityScore: 0.73 },
      matches: [],
      recommendation: "probably_new",
    });
    renderComposer();

    await user.upload(
      screen.getByLabelText(/enviar imagem/i),
      new File(["pet"], "pet.png", { type: "image/png" }),
    );

    expect(
      await screen.findByText("Parece ser um animal novo neste local."),
    ).toBeInTheDocument();
  });

  it("calls analyzePetSighting with the uploaded file and place id", async () => {
    const user = userEvent.setup();
    renderComposer();

    const file = new File(["pet"], "pet.png", { type: "image/png" });
    await user.upload(screen.getByLabelText(/enviar imagem/i), file);

    expect(analyzePetSightingMock).toHaveBeenCalledWith(file, placeId);
  });

  it("calls analyzePetSighting with the captured file and place id", async () => {
    const user = userEvent.setup();
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      drawImage: vi.fn(),
    });
    HTMLCanvasElement.prototype.toDataURL = vi
      .fn()
      .mockReturnValue("data:image/png;base64,cGV0");
    renderComposer();

    await user.click(screen.getByRole("button", { name: /abrir camera/i }));
    await user.click(screen.getByRole("button", { name: /capturar foto/i }));

    expect(analyzePetSightingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "camera-sighting.png",
        type: "image/png",
      }),
      placeId,
    );
  });
});
