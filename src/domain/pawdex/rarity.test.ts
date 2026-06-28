import { describe, expect, it } from "vitest";
import { computeRarity } from "./rarity";

describe("computeRarity", () => {
  it("rates seldom-seen animals as common and not foil", () => {
    const r = computeRarity(1);
    expect(r.tier).toBe("comum");
    expect(r.isFoil).toBe(false);
  });

  it("promotes frequently seen animals to rare (foil)", () => {
    expect(computeRarity(3).tier).toBe("raro");
    expect(computeRarity(3).isFoil).toBe(true);
  });

  it("makes the most-seen stars legendary (chrome)", () => {
    const r = computeRarity(8);
    expect(r.tier).toBe("lenda");
    expect(r.isFoil).toBe(true);
  });

  it("scales the overall rating with appearances and caps at 99", () => {
    expect(computeRarity(0).overall).toBe(62);
    expect(computeRarity(100).overall).toBe(99);
  });
});
