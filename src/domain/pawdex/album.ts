import type {
  AlbumSlotView,
  Animal,
  PawDexState,
  PlaceProgress,
  Sighting,
} from "./types";

export function getPlaceProgress(
  state: PawDexState,
  placeId: string,
): PlaceProgress {
  const slots = state.albumSlots.filter((slot) => slot.placeId === placeId);

  return {
    discovered: slots.filter((slot) => slot.isDiscovered).length,
    total: slots.length,
  };
}

export function getAlbumSlots(
  state: PawDexState,
  placeId: string,
): AlbumSlotView[] {
  return state.albumSlots
    .filter((slot) => slot.placeId === placeId)
    .sort((a, b) => a.slotNumber - b.slotNumber)
    .map((slot) => ({
      ...slot,
      animal:
        state.animals.find((animal) => animal.id === slot.animalId) ?? null,
      appearances: slot.animalId
        ? state.sightings.filter(
            (sighting) => sighting.animalId === slot.animalId,
          ).length
        : 0,
    }));
}

export function getLatestSightings(
  state: PawDexState,
  placeId: string,
  limit = 5,
): Sighting[] {
  return state.sightings
    .filter((sighting) => sighting.placeId === placeId)
    .sort(
      (a, b) =>
        new Date(b.takenAt).getTime() - new Date(a.takenAt).getTime(),
    )
    .slice(0, limit);
}

export function getAnimalsForPlace(
  state: PawDexState,
  placeId: string,
): Animal[] {
  return state.animals.filter((animal) => animal.placeId === placeId);
}

export function getSightingsForAnimal(
  state: PawDexState,
  animalId: string,
): Sighting[] {
  return state.sightings
    .filter((sighting) => sighting.animalId === animalId)
    .sort(
      (a, b) =>
        new Date(b.takenAt).getTime() - new Date(a.takenAt).getTime(),
    );
}
