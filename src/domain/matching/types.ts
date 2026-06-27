import type { DetectionBox, DetectionSpecies } from "@/domain/detection/types";
import type { PawDexState, Species } from "@/domain/pawdex/types";

export type MatchRecommendation =
  | "possible_existing"
  | "probably_new"
  | "no_pet_detected"
  | "needs_better_photo";

export type MatchCandidate = {
  animalId: string;
  displayName: string;
  species: Species;
  primaryPhotoUrl: string;
  score: number;
};

export type AnalyzeSightingResponse = {
  analysisId: string | null;
  detection: {
    species: DetectionSpecies;
    label: string;
    confidence: number;
    box: DetectionBox;
  } | null;
  embedding: {
    modelVersion: string;
    qualityScore: number;
  } | null;
  matches: MatchCandidate[];
  recommendation: MatchRecommendation;
  error?: string;
};

export type ConfirmSightingPayload =
  | {
      analysisId: string;
      placeId: string;
      decision: "existing";
      animalId: string;
      matchConfidence: number;
      photoUrl: string;
      zoneLabel?: string;
    }
  | {
      analysisId: string;
      placeId: string;
      decision: "new";
      displayName: string;
      species: Species;
      photoUrl: string;
      zoneLabel?: string;
    };

export type ConfirmSightingResponse = {
  state: PawDexState;
  selectedAnimalId: string;
  error?: string;
};
