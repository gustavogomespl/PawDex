import { describe, expect, it, vi } from "vitest";
import {
  authorizePasswordCredentials,
  authenticateUser,
  isDevEmailAuthEnabled,
  normalizeDisplayName,
  normalizeEmail,
  registerUser,
  resolveAuthMode,
  syncUser,
} from "./dev-auth";

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

describe("normalizeDisplayName", () => {
  it("trims and collapses whitespace in a display name", () => {
    expect(normalizeDisplayName("  Ana   Tutor  ")).toBe("Ana Tutor");
  });

  it("returns null for empty or non-string names", () => {
    expect(normalizeDisplayName("   ")).toBeNull();
    expect(normalizeDisplayName(null)).toBeNull();
    expect(normalizeDisplayName(undefined)).toBeNull();
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

describe("resolveAuthMode", () => {
  it("uses explicit signup mode", () => {
    expect(resolveAuthMode("signup", null)).toBe("signup");
  });

  it("treats a display name as signup intent when mode is missing", () => {
    expect(resolveAuthMode(undefined, "Ana Tutor")).toBe("signup");
  });

  it("defaults to signin without signup mode or name", () => {
    expect(resolveAuthMode(undefined, null)).toBe("signin");
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

describe("password auth", () => {
  it("registers a user with a password through the ml-api", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "user-1",
          email: "a@b.com",
          name: "Ana",
          avatarUrl: null,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const user = await registerUser(
      "a@b.com",
      "Ana",
      "senha-segura",
      fetchMock,
      "http://ml-api:8000",
    );

    expect(user.name).toBe("Ana");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://ml-api:8000/users/register",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body).toEqual({
      email: "a@b.com",
      name: "Ana",
      password: "senha-segura",
    });
  });

  it("authenticates a user with e-mail and password through the ml-api", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "user-1",
          email: "a@b.com",
          name: "Ana",
          avatarUrl: null,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const user = await authenticateUser(
      "a@b.com",
      "senha-segura",
      fetchMock,
      "http://ml-api:8000",
    );

    expect(user.id).toBe("user-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://ml-api:8000/users/login",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body).toEqual({ email: "a@b.com", password: "senha-segura" });
  });

  it("registers when the submitted credentials have a name even without mode", async () => {
    const register = vi.fn().mockResolvedValue({
      id: "user-1",
      email: "ana@example.com",
      name: "Ana Tutor",
      avatarUrl: null,
    });
    const authenticate = vi.fn();

    const user = await authorizePasswordCredentials(
      {
        email: "Ana@Example.com",
        name: " Ana   Tutor ",
        password: "senha-segura",
      },
      { registerUser: register, authenticateUser: authenticate },
    );

    expect(user?.id).toBe("user-1");
    expect(register).toHaveBeenCalledWith(
      "ana@example.com",
      "Ana Tutor",
      "senha-segura",
    );
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("returns null instead of throwing when the backend rejects credentials", async () => {
    const authenticate = vi.fn().mockRejectedValue(new Error("401"));

    await expect(
      authorizePasswordCredentials(
        {
          email: "ana@example.com",
          password: "senha-segura",
          mode: "signin",
        },
        { authenticateUser: authenticate },
      ),
    ).resolves.toBeNull();
  });
});
