/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const emptyState = {
  places: [],
  animals: [],
  sightings: [],
  albumSlots: [],
};

const successBody = {
  places: [
    {
      id: "park 1",
      name: "Park",
      type: "park",
      privacyLevel: "public",
      albumTotalSlots: 12,
    },
  ],
  animals: [],
  sightings: [],
  albumSlots: [],
};

describe("GET /api/pawdex/state", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("loads place state from the ML API using a URL-encoded place id", async () => {
    vi.stubEnv("ML_API_URL", "http://ml-api:8000");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(successBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request("http://localhost/api/pawdex/state?placeId=park%201"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(successBody);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://ml-api:8000/places/park%201/state",
    );
  });

  it("returns 400 when the request does not include a place id", async () => {
    const response = await GET(
      new Request("http://localhost/api/pawdex/state?placeId=   "),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ...emptyState,
      error: "Local obrigatorio.",
    });
  });

  it("returns 502 when the ML API is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const response = await GET(
      new Request("http://localhost/api/pawdex/state?placeId=park-1"),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      ...emptyState,
      error: "Nao foi possivel carregar a PawDex agora.",
    });
  });
});
