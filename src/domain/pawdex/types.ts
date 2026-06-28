export type Species = "cat" | "dog";

export type PrivacyLevel = "private" | "invite-only" | "public";

export type AnimalStatus =
  | "unknown"
  | "has-owner"
  | "community"
  | "lost"
  | "needs-help";

export type ReviewStatus = "confirmed" | "needs-review";

export type Place = {
  id: string;
  name: string;
  type: string;
  privacyLevel: PrivacyLevel;
  albumTotalSlots: number;
};

export type Animal = {
  id: string;
  placeId: string;
  species: Species;
  displayName: string;
  status: AnimalStatus;
  description: string;
  colorTags: string[];
  rarityLabel: string;
  primaryPhotoUrl: string;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type Sighting = {
  id: string;
  placeId: string;
  animalId: string;
  photoUrl: string;
  zoneLabel: string;
  takenAt: string;
  matchConfidence: number | null;
  reviewStatus: ReviewStatus;
};

export type AlbumSlot = {
  slotNumber: number;
  placeId: string;
  animalId: string | null;
  isDiscovered: boolean;
};

export type PawDexState = {
  places: Place[];
  animals: Animal[];
  sightings: Sighting[];
  albumSlots: AlbumSlot[];
};

export type AlbumSlotView = AlbumSlot & {
  animal: Animal | null;
  appearances: number;
};

export type PlaceProgress = {
  discovered: number;
  total: number;
};
