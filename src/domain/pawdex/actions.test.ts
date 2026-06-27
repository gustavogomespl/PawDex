import { describe, expect, it } from "vitest";
import {
  addSightingToAnimal,
  createAnimalFromSighting,
  suggestMatchesForPlace,
} from "./actions";
import { demoState } from "./seed";

describe("pawdex actions", () => {
  it("adds a sighting to an existing animal and updates lastSeenAt", () => {
    const nextState = addSightingToAnimal(demoState, {
      sightingId: "sighting-test-existing",
      placeId: "place-office-centro",
      animalId: "animal-mingau",
      photoUrl: "data:image/png;base64,abc",
      zoneLabel: "Recepcao",
      takenAt: "2026-06-27T10:00:00.000Z",
      matchConfidence: 0.87,
    });

    expect(nextState.sightings).toHaveLength(demoState.sightings.length + 1);
    expect(
      nextState.sightings.find(
        (sighting) => sighting.id === "sighting-test-existing",
      ),
    ).toMatchObject({
      animalId: "animal-mingau",
      reviewStatus: "confirmed",
    });
    expect(
      nextState.animals.find((animal) => animal.id === "animal-mingau")
        ?.lastSeenAt,
    ).toBe("2026-06-27T10:00:00.000Z");
  });

  it("creates a new animal in the next empty album slot", () => {
    const nextState = createAnimalFromSighting(demoState, {
      animalId: "animal-nina",
      sightingId: "sighting-nina-001",
      placeId: "place-office-centro",
      displayName: "Nina",
      species: "cat",
      photoUrl: "data:image/png;base64,new",
      zoneLabel: "Jardim",
      takenAt: "2026-06-27T11:00:00.000Z",
    });

    expect(
      nextState.animals.find((animal) => animal.id === "animal-nina"),
    ).toMatchObject({
      displayName: "Nina",
      primaryPhotoUrl: "data:image/png;base64,new",
      firstSeenAt: "2026-06-27T11:00:00.000Z",
      lastSeenAt: "2026-06-27T11:00:00.000Z",
    });
    expect(nextState.albumSlots.find((slot) => slot.slotNumber === 8))
      .toMatchObject({
        animalId: "animal-nina",
        isDiscovered: true,
      });
  });

  it("expands the album when no empty slots remain", () => {
    const fullState = {
      ...demoState,
      places: [{ ...demoState.places[0], albumTotalSlots: 7 }],
      albumSlots: demoState.albumSlots.slice(0, 7),
    };

    const nextState = createAnimalFromSighting(fullState, {
      animalId: "animal-extra",
      sightingId: "sighting-extra-001",
      placeId: "place-office-centro",
      displayName: "Extra",
      species: "dog",
      photoUrl: "data:image/png;base64,extra",
      zoneLabel: "Portaria",
      takenAt: "2026-06-27T12:00:00.000Z",
    });

    expect(nextState.places[0].albumTotalSlots).toBe(8);
    expect(nextState.albumSlots[7]).toMatchObject({
      slotNumber: 8,
      animalId: "animal-extra",
      isDiscovered: true,
    });
  });

  it("suggests matches only from the active place", () => {
    const state = {
      ...demoState,
      animals: [
        ...demoState.animals,
        {
          ...demoState.animals[0],
          id: "animal-other-place",
          placeId: "place-other",
          displayName: "Outro Lugar",
        },
      ],
    };

    const suggestions = suggestMatchesForPlace(state, "place-office-centro", 3);

    expect(suggestions).toHaveLength(3);
    expect(suggestions.map((suggestion) => suggestion.placeId)).toEqual([
      "place-office-centro",
      "place-office-centro",
      "place-office-centro",
    ]);
  });
});
