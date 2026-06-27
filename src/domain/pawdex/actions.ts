import type { Animal, PawDexState, Sighting, Species } from "./types";

export type AddSightingToAnimalInput = {
  sightingId: string;
  placeId: string;
  animalId: string;
  photoUrl: string;
  zoneLabel: string;
  takenAt: string;
  matchConfidence: number | null;
};

export type CreateAnimalFromSightingInput = {
  animalId: string;
  sightingId: string;
  placeId: string;
  displayName: string;
  species: Species;
  photoUrl: string;
  zoneLabel: string;
  takenAt: string;
};

export function addSightingToAnimal(
  state: PawDexState,
  input: AddSightingToAnimalInput,
): PawDexState {
  const sighting: Sighting = {
    id: input.sightingId,
    placeId: input.placeId,
    animalId: input.animalId,
    photoUrl: input.photoUrl,
    zoneLabel: input.zoneLabel,
    takenAt: input.takenAt,
    matchConfidence: input.matchConfidence,
    reviewStatus: "confirmed",
  };

  return {
    ...state,
    animals: state.animals.map((animal) =>
      animal.id === input.animalId
        ? { ...animal, lastSeenAt: input.takenAt, primaryPhotoUrl: input.photoUrl }
        : animal,
    ),
    sightings: [...state.sightings, sighting],
  };
}

export function createAnimalFromSighting(
  state: PawDexState,
  input: CreateAnimalFromSightingInput,
): PawDexState {
  const animal: Animal = {
    id: input.animalId,
    placeId: input.placeId,
    species: input.species,
    displayName: input.displayName,
    status: "unknown",
    description: "Novo animal registrado neste lugar.",
    colorTags: [],
    rarityLabel: "Novo",
    primaryPhotoUrl: input.photoUrl,
    firstSeenAt: input.takenAt,
    lastSeenAt: input.takenAt,
  };

  const sighting: Sighting = {
    id: input.sightingId,
    placeId: input.placeId,
    animalId: input.animalId,
    photoUrl: input.photoUrl,
    zoneLabel: input.zoneLabel,
    takenAt: input.takenAt,
    matchConfidence: null,
    reviewStatus: "confirmed",
  };

  const emptySlot = state.albumSlots.find(
    (slot) => slot.placeId === input.placeId && !slot.isDiscovered,
  );
  const maxSlot = Math.max(
    0,
    ...state.albumSlots
      .filter((slot) => slot.placeId === input.placeId)
      .map((slot) => slot.slotNumber),
  );
  const assignedSlotNumber = emptySlot?.slotNumber ?? maxSlot + 1;
  const albumSlots = emptySlot
    ? state.albumSlots.map((slot) =>
        slot.placeId === input.placeId &&
        slot.slotNumber === emptySlot.slotNumber
          ? { ...slot, animalId: input.animalId, isDiscovered: true }
          : slot,
      )
    : [
        ...state.albumSlots,
        {
          slotNumber: assignedSlotNumber,
          placeId: input.placeId,
          animalId: input.animalId,
          isDiscovered: true,
        },
      ];

  return {
    ...state,
    places: state.places.map((place) =>
      place.id === input.placeId && assignedSlotNumber > place.albumTotalSlots
        ? { ...place, albumTotalSlots: assignedSlotNumber }
        : place,
    ),
    animals: [...state.animals, animal],
    sightings: [...state.sightings, sighting],
    albumSlots,
  };
}

export function suggestMatchesForPlace(
  state: PawDexState,
  placeId: string,
  limit = 3,
): Animal[] {
  return [...state.animals]
    .filter((animal) => animal.placeId === placeId)
    .sort(
      (a, b) =>
        new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(),
    )
    .slice(0, limit);
}

export function createLocalId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}
