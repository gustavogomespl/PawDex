import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzePetSighting, confirmPetSighting } from "./client";

describe("matching client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts sighting analysis FormData and returns the response body", async () => {
    const body = {
      analysisId: "analysis-1",
      detection: null,
      embedding: null,
      matches: [],
      recommendation: "no_pet_detected",
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(body),
    });
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["pet"], "pet.png", { type: "image/png" });
    const result = await analyzePetSighting(file, "place-office-centro");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/analyze-sighting",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      }),
    );
    const formData = fetchMock.mock.calls[0][1].body as FormData;
    expect(formData.get("file")).toEqual(
      expect.objectContaining({
        name: "pet.png",
        type: "image/png",
      }),
    );
    expect(formData.get("placeId")).toBe("place-office-centro");
    expect(result).toBe(body);
  });

  it("throws backend analysis errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({
          analysisId: null,
          detection: null,
          embedding: null,
          matches: [],
          recommendation: "no_pet_detected",
          error: "analysis unavailable",
        }),
      }),
    );

    await expect(
      analyzePetSighting(
        new File(["pet"], "pet.png", { type: "image/png" }),
        "place-office-centro",
      ),
    ).rejects.toThrow("analysis unavailable");
  });

  it("posts confirmation JSON unchanged and returns the response body", async () => {
    const body = {
      state: { places: [], animals: [], sightings: [], albumSlots: [] },
      selectedAnimalId: "animal-mingau",
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(body),
    });
    vi.stubGlobal("fetch", fetchMock);
    const payload = {
      analysisId: "analysis-1",
      placeId: "place-office-centro",
      decision: "existing" as const,
      animalId: "animal-mingau",
      matchConfidence: 0.86,
      photoUrl: "data:image/png;base64,cGV0",
    };

    const result = await confirmPetSighting(payload);

    expect(fetchMock).toHaveBeenCalledWith("/api/confirm-sighting", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(result).toBe(body);
  });

  it("throws backend confirmation errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({
          state: { places: [], animals: [], sightings: [], albumSlots: [] },
          selectedAnimalId: "",
          error: "confirmation unavailable",
        }),
      }),
    );

    await expect(
      confirmPetSighting({
        analysisId: "analysis-1",
        placeId: "place-office-centro",
        decision: "new",
        displayName: "Nina",
        species: "cat",
        photoUrl: "data:image/png;base64,cGV0",
      }),
    ).rejects.toThrow("confirmation unavailable");
  });
});
