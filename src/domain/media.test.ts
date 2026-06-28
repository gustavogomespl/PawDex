import { describe, expect, it } from "vitest";
import { mediaSrc } from "./media";

describe("mediaSrc", () => {
  it("proxies object-storage keys through /api/media", () => {
    expect(mediaSrc("crops/abc.jpg")).toBe("/api/media/crops/abc.jpg");
  });

  it("returns absolute URLs, data URLs and paths unchanged", () => {
    expect(mediaSrc("https://example.com/a.jpg")).toBe("https://example.com/a.jpg");
    expect(mediaSrc("data:image/png;base64,xxx")).toBe("data:image/png;base64,xxx");
    expect(mediaSrc("/local.png")).toBe("/local.png");
  });
});
