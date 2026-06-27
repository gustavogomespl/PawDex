export type DetectionSpecies = "cat" | "dog";

export type DetectionBox = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type PetDetection = {
  species: DetectionSpecies;
  label: string;
  confidence: number;
  box: DetectionBox;
};

export type DetectionResponse = {
  detections: PetDetection[];
  bestDetection: PetDetection | null;
  error?: string;
};
