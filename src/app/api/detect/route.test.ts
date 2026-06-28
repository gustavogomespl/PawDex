/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const successBody = {
  detections: [
    {
      species: "dog",
      label: "dog",
      confidence: 0.82,
      box: { x1: 1, y1: 2, x2: 30, y2: 40 },
    },
  ],
  bestDetection: {
    species: "dog",
    label: "dog",
    confidence: 0.82,
    box: { x1: 1, y1: 2, x2: 30, y2: 40 },
  },
};

describe("POST /api/detect", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("forwards uploaded image to the ML API", async () => {
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

    const response = await POST(
      new Request("http://localhost/api/detect", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(successBody);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://ml-api:8000/detect",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
    );
  });

  it("returns 400 when the browser request does not include a file", async () => {
    const response = await POST(
      new Request("http://localhost/api/detect", {
        method: "POST",
        body: new FormData(),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      detections: [],
      bestDetection: null,
      error: "Imagem obrigatoria.",
    });
  });

  it("returns 400 when the form data cannot be parsed", async () => {
    const request = {
      formData: vi.fn().mockRejectedValue(new Error("malformed")),
    } as unknown as Request;

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      detections: [],
      bestDetection: null,
      error: "Requisicao invalida.",
    });
  });

  it("returns 502 when the ML API is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const formData = new FormData();
    formData.set("file", new File(["pet"], "pet.png", { type: "image/png" }));

    const response = await POST(
      new Request("http://localhost/api/detect", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      detections: [],
      bestDetection: null,
      error: "Nao foi possivel analisar a imagem agora.",
    });
  });
});
