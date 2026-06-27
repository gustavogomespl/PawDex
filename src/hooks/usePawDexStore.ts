"use client";

import { useEffect, useState } from "react";
import { confirmPetSighting } from "@/domain/matching/client";
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
  analysisId: string;
  animalId: string;
  photoUrl: string;
  matchConfidence: number;
};

export type NewAnimalInput = {
  analysisId: string;
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
    let isMounted = true;

    async function loadInitialState() {
      try {
        const response = await fetch(
          `/api/pawdex/state?placeId=${ACTIVE_PLACE_ID}`,
        );

        if (!response.ok) {
          throw new Error("Remote PawDex state failed.");
        }

        const remoteState = (await response.json()) as PawDexState;

        if (!isMounted) {
          return;
        }

        setState(remoteState);
        setSelectedAnimalId((currentAnimalId) =>
          getSelectedAnimalId(remoteState, currentAnimalId),
        );
        setWarning(null);
      } catch {
        const result = loadPawDexState();

        if (!isMounted) {
          return;
        }

        setState(result.state);
        setSelectedAnimalId((currentAnimalId) =>
          getSelectedAnimalId(result.state, currentAnimalId),
        );
        setWarning(formatRemoteLoadWarning(result.warning));
      } finally {
        if (isMounted) {
          setHasLoadedStoredState(true);
        }
      }
    }

    void loadInitialState();

    return () => {
      isMounted = false;
    };
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

  async function addExistingSighting(input: ExistingSightingInput) {
    try {
      const response = await confirmPetSighting({
        analysisId: input.analysisId,
        placeId: ACTIVE_PLACE_ID,
        decision: "existing",
        animalId: input.animalId,
        photoUrl: input.photoUrl,
        zoneLabel: "Area comum",
      });

      setState(response.state);
      setSelectedAnimalId(response.selectedAnimalId);
      setWarning(null);
      setNotice("Avistamento salvo na PawDex.");
    } catch (error) {
      setWarning("Nao foi possivel salvar o avistamento agora.");
      throw error;
    }
  }

  async function createNewAnimal(input: NewAnimalInput) {
    try {
      const response = await confirmPetSighting({
        analysisId: input.analysisId,
        placeId: ACTIVE_PLACE_ID,
        decision: "new",
        displayName: input.displayName,
        species: input.species,
        photoUrl: input.photoUrl,
        zoneLabel: "Area comum",
      });

      setState(response.state);
      setSelectedAnimalId(response.selectedAnimalId);
      setWarning(null);
      setNotice("Novo animal adicionado ao album.");
    } catch (error) {
      setWarning("Nao foi possivel salvar o avistamento agora.");
      throw error;
    }
  }

  return {
    place,
    progress,
    albumSlots,
    animals,
    latestSightings,
    selectedAnimal,
    selectedAnimalSightings,
    warning,
    notice,
    setWarning,
    setNotice,
    setSelectedAnimalId,
    addExistingSighting,
    createNewAnimal,
  };
}

function getSelectedAnimalId(
  state: PawDexState,
  currentAnimalId: string | null,
): string | null {
  const animals = getAnimalsForPlace(state, ACTIVE_PLACE_ID);

  if (currentAnimalId && animals.some((animal) => animal.id === currentAnimalId)) {
    return currentAnimalId;
  }

  return animals[0]?.id ?? null;
}

function formatRemoteLoadWarning(localWarning: string | null): string {
  const remoteWarning =
    "Nao foi possivel carregar a PawDex remota. Usando dados locais.";

  return localWarning ? `${remoteWarning} ${localWarning}` : remoteWarning;
}
