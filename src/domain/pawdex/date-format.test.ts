import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("formatSightingDateTime", () => {
  it("formats sightings in the PawDex place timezone instead of host timezone", async () => {
    vi.stubEnv("TZ", "UTC");
    vi.resetModules();
    const { formatSightingDateTime } = await import("./date-format");

    expect(formatSightingDateTime("2026-06-24T13:20:00.000Z")).toBe(
      "24 de jun., 10:20",
    );
  });
});
