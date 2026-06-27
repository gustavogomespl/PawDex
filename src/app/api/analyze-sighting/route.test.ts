/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const successBody = {
  analysisId: "analysis-1",
  detection: {
    species: "dog",
    label: "dog",
    confidence: 0.91,
    box: { x1: 1, y1: 2, x2: 30, y2: 40 },
  },
  embedding: {
    modelVersion: "clip-v1",
    qualityScore: 0.87,
  },
  matches: [
    {
      animalId: "animal-1",
      displayName: "Caramelo",
      species: "dog",
      primaryPhotoUrl: "/animals/caramelo.jpg",
      score: 0.82,
    },
  ],
  recommendation: "possible_existing",
};

const emptyAnalyzeBody = (error: string) => ({
  analysisId: null,
  detection: null,
  embedding: null,
  matches: [],
  recommendation: "no_pet_detected",
  error,
});

describe("POST /api/analyze-sighting", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("forwards uploaded image and place id to the ML API", async () => {
    vi.stubEnv("ML_API_URL", "http://ml-api:8000");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(successBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const formData = new FormData();
    formData.set("file", new File(["pet"], "pet.png", { type: "image/png" }));
    formData.set("placeId", "park-1");

    const response = await POST(
      new Request("http://localhost/api/analyze-sighting", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(successBody);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://ml-api:8000/analyze-sighting",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
    );
    const outgoingForm = fetchMock.mock.calls[0][1].body as FormData;
    expect(outgoingForm.get("place_id")).toBe("park-1");
    expect(outgoingForm.get("file")).toBeInstanceOf(File);
  });

  it("returns 400 when the browser request does not include a file", async () => {
    const formData = new FormData();
    formData.set("placeId", "park-1");

    const response = await POST(
      new Request("http://localhost/api/analyze-sighting", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(emptyAnalyzeBody("Imagem obrigatoria."));
  });

  it("returns 400 when the browser request does not include a place id", async () => {
    const formData = new FormData();
    formData.set("file", new File(["pet"], "pet.png", { type: "image/png" }));
    formData.set("placeId", "   ");

    const response = await POST(
      new Request("http://localhost/api/analyze-sighting", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(emptyAnalyzeBody("Local obrigatorio."));
  });

  it("returns 502 when the ML API is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const formData = new FormData();
    formData.set("file", new File(["pet"], "pet.png", { type: "image/png" }));
    formData.set("placeId", "park-1");

    const response = await POST(
      new Request("http://localhost/api/analyze-sighting", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual(
      emptyAnalyzeBody("Nao foi possivel analisar a imagem agora."),
    );
  });
});
