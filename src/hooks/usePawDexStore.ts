"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addSightingToAnimal,
  createAnimalFromSighting,
  createLocalId,
  suggestMatchesForPlace,
} from "@/domain/pawdex/actions";
import {
  getAlbumSlots,
  getAnimalsForPlace,
  getLatestSightings,
  getPlaceProgress,
  getSightingsForAnimal,
} from "@/domain/pawdex/album";
import { demoState } from "@/domain/pawdex/seed";
import { loadPawDexState, savePawDexState } from "@/domain/pawdex/storage";
import type { PawDexState, Species } from "@/domain/pawdex/types";

const ACTIVE_PLACE_ID = "place-office-centro";

export type ExistingSightingInput = {
  animalId: string;
  photoUrl: string;
};

export type NewAnimalInput = {
  displayName: string;
  species: Species;
  photoUrl: string;
};

export function usePawDexStore() {
  const [state, setState] = useState<PawDexState>(demoState);
  const [hasLoadedStoredState, setHasLoadedStoredState] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedAnimalId, setSelectedAnimalId] = useState<string | null>(
    "animal-mingau",
  );

  useEffect(() => {
    const result = loadPawDexState();
    setState(result.state);
    setWarning(result.warning);
    setHasLoadedStoredState(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedStoredState) {
      return;
    }

    const saveWarning = savePawDexState(state);

    if (saveWarning) {
      setWarning(saveWarning);
    }
  }, [hasLoadedStoredState, state]);

  const place = state.places.find((candidate) => candidate.id === ACTIVE_PLACE_ID);
  const progress = getPlaceProgress(state, ACTIVE_PLACE_ID);
  const albumSlots = getAlbumSlots(state, ACTIVE_PLACE_ID);
  const animals = getAnimalsForPlace(state, ACTIVE_PLACE_ID);
  const latestSightings = getLatestSightings(state, ACTIVE_PLACE_ID, 5);
  const selectedAnimal =
    animals.find((animal) => animal.id === selectedAnimalId) ?? animals[0] ?? null;
  const selectedAnimalSightings = selectedAnimal
    ? getSightingsForAnimal(state, selectedAnimal.id)
    : [];
  const suggestions = useMemo(
    () => suggestMatchesForPlace(state, ACTIVE_PLACE_ID, 3),
    [state],
  );

  function addExistingSighting(input: ExistingSightingInput) {
    const now = new Date().toISOString();
    setState((current) =>
      addSightingToAnimal(current, {
        sightingId: createLocalId("sighting"),
        placeId: ACTIVE_PLACE_ID,
        animalId: input.animalId,
        photoUrl: input.photoUrl,
        zoneLabel: "Area comum",
        takenAt: now,
        matchConfidence: 0.84,
      }),
    );
    setSelectedAnimalId(input.animalId);
    setNotice("Avistamento salvo na PawDex local.");
  }

  function createNewAnimal(input: NewAnimalInput) {
    const animalId = createLocalId("animal");
    const now = new Date().toISOString();

    setState((current) =>
      createAnimalFromSighting(current, {
        animalId,
        sightingId: createLocalId("sighting"),
        placeId: ACTIVE_PLACE_ID,
        displayName: input.displayName,
        species: input.species,
        photoUrl: input.photoUrl,
        zoneLabel: "Area comum",
        takenAt: now,
      }),
    );
    setSelectedAnimalId(animalId);
    setNotice("Novo animal adicionado ao album.");
  }

  return {
    place,
    progress,
    albumSlots,
    animals,
    latestSightings,
    selectedAnimal,
    selectedAnimalSightings,
    suggestions,
    warning,
    notice,
    setWarning,
    setNotice,
    setSelectedAnimalId,
    addExistingSighting,
    createNewAnimal,
  };
}
