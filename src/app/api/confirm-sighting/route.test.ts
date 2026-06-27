/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const emptyState = {
  places: [],
  animals: [],
  sightings: [],
  albumSlots: [],
};

const successBody = {
  state: {
    places: [
      {
        id: "park-1",
        name: "Park",
        type: "park",
        privacyLevel: "public",
        albumTotalSlots: 12,
      },
    ],
    animals: [],
    sightings: [],
    albumSlots: [],
  },
  selectedAnimalId: "animal-1",
};

describe("POST /api/confirm-sighting", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("forwards confirmation JSON unchanged to the ML API", async () => {
    vi.stubEnv("ML_API_URL", "http://ml-api:8000");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(successBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const payload = {
      analysisId: "analysis-1",
      placeId: "park-1",
      decision: "existing",
      animalId: "animal-1",
      photoUrl: "/uploads/pet.png",
      zoneLabel: "Gate",
    };

    const response = await POST(
      new Request("http://localhost/api/confirm-sighting", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(successBody);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://ml-api:8000/confirm-sighting",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
  });

  it("returns 400 for malformed JSON without calling the ML API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new Request("http://localhost/api/confirm-sighting", {
        method: "POST",
        body: "{",
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      state: emptyState,
      selectedAnimalId: "",
      error: "Confirmacao invalida.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["array", []],
    ["null", null],
  ])(
    "returns 400 for valid JSON %s without calling the ML API",
    async (_, body) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const response = await POST(
        new Request("http://localhost/api/confirm-sighting", {
          method: "POST",
          body: JSON.stringify(body),
          headers: { "content-type": "application/json" },
        }),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        state: emptyState,
        selectedAnimalId: "",
        error: "Confirmacao invalida.",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("returns 502 when the ML API rejects the confirmation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 500 })),
    );

    const response = await POST(
      new Request("http://localhost/api/confirm-sighting", {
        method: "POST",
        body: JSON.stringify({
          analysisId: "analysis-1",
          placeId: "park-1",
          decision: "existing",
          animalId: "animal-1",
          photoUrl: "/uploads/pet.png",
        }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      state: emptyState,
      selectedAnimalId: "",
      error: "Nao foi possivel confirmar o avistamento agora.",
    });
  });

  it("returns 502 when the ML API is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const payload = {
      analysisId: "analysis-1",
      placeId: "park-1",
      decision: "new",
      displayName: "Mingau",
      species: "cat",
      photoUrl: "/uploads/cat.png",
    };

    const response = await POST(
      new Request("http://localhost/api/confirm-sighting", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      state: emptyState,
      selectedAnimalId: "",
      error: "Nao foi possivel confirmar o avistamento agora.",
    });
  });
});
