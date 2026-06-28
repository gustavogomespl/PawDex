import { describe, expect, it, vi } from "vitest";
import { isDevEmailAuthEnabled, normalizeEmail, syncUser } from "./dev-auth";

describe("normalizeEmail", () => {
  it("trims and lowercases a valid email", () => {
    expect(normalizeEmail("  Tutor@Example.COM ")).toBe("tutor@example.com");
  });

  it("rejects malformed or empty input", () => {
    expect(normalizeEmail("nope")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });
});

describe("isDevEmailAuthEnabled", () => {
  it("is enabled outside production by default for local development", () => {
    expect(isDevEmailAuthEnabled({ NODE_ENV: "development" })).toBe(true);
  });

  it("is disabled in production unless explicitly enabled", () => {
    expect(isDevEmailAuthEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(
      isDevEmailAuthEnabled({
        NODE_ENV: "production",
        PAWDEX_ENABLE_DEV_AUTH: "true",
      }),
    ).toBe(true);
  });

  it("honors an explicit false flag even outside production", () => {
    expect(
      isDevEmailAuthEnabled({
        NODE_ENV: "development",
        PAWDEX_ENABLE_DEV_AUTH: "false",
      }),
    ).toBe(false);
  });
});

describe("syncUser", () => {
  it("upserts via the ml-api and returns the synced user", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "user-1",
          email: "a@b.com",
          name: null,
          avatarUrl: null,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const user = await syncUser("a@b.com", null, fetchMock, "http://ml-api:8000");

    expect(user.id).toBe("user-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://ml-api:8000/users/sync",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body).toEqual({ email: "a@b.com", name: null });
  });

  it("throws when the ml-api returns an error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("boom", { status: 500 }));

    await expect(
      syncUser("a@b.com", null, fetchMock, "http://ml-api:8000"),
    ).rejects.toThrow();
  });
});
