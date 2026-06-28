/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "user-1" } })),
}));

import { auth } from "@/auth";
import { GET } from "./route";

describe("GET /api/media/[...key]", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("forwards the logged-in user id to the ML API media endpoint", async () => {
    vi.stubEnv("ML_API_URL", "http://ml-api:8000");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://localhost/api/media/crops/x.jpg"), {
      params: Promise.resolve({ key: ["crops", "x.jpg"] }),
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://ml-api:8000/media/crops/x.jpg?user_id=user-1",
      {
        cache: "no-store",
        headers: {},
      },
    );
  });

  it("rejects anonymous requests before reaching the ML API", async () => {
    vi.mocked(auth as unknown as () => Promise<unknown>).mockResolvedValueOnce(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://localhost/api/media/crops/x.jpg"), {
      params: Promise.resolve({ key: ["crops", "x.jpg"] }),
    });

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
