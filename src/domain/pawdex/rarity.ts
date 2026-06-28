export type RarityTier = "comum" | "raro" | "lenda";

export type CardRarity = {
  tier: RarityTier;
  label: string;
  isFoil: boolean;
  overall: number;
};

/**
 * Healthy rarity: derived from how often the animal is actually seen. The rarest
 * (most-seen "stars" of the place) become foil/chrome stickers. "overall" is a
 * playful 62–99 rating shown like a player card.
 */
export function computeRarity(appearances: number): CardRarity {
  const seen = Math.max(0, appearances);
  let tier: RarityTier = "comum";
  if (seen >= 6) {
    tier = "lenda";
  } else if (seen >= 3) {
    tier = "raro";
  }

  const label = tier === "lenda" ? "Lenda" : tier === "raro" ? "Raro" : "Comum";
  const overall = Math.min(99, 62 + seen * 4);

  return { tier, label, isFoil: tier !== "comum", overall };
}
