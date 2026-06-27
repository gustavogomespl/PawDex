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
  const [state, setState] = useState<PawDexState | null>(null);
  const [stateSource, setStateSource] = useState<"remote" | "local">("remote");
  const [hasLoadedInitialState, setHasLoadedInitialState] = useState(false);
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
        setStateSource("remote");
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
        setStateSource("local");
        setSelectedAnimalId((currentAnimalId) =>
          getSelectedAnimalId(result.state, currentAnimalId),
        );
        setWarning(formatRemoteLoadWarning(result.warning));
      } finally {
        if (isMounted) {
          setHasLoadedInitialState(true);
        }
      }
    }

    void loadInitialState();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedInitialState || !state) {
      return;
    }

    // Postgres is authoritative. Only persist to localStorage when we are running
    // on the offline fallback, so remote state (including photo data URLs) never
    // gets mirrored into the size-limited localStorage cache.
    if (stateSource !== "local") {
      return;
    }

    const saveWarning = savePawDexState(state);

    if (saveWarning) {
      setWarning(saveWarning);
    }
  }, [hasLoadedInitialState, state, stateSource]);

  const place = state?.places.find((candidate) => candidate.id === ACTIVE_PLACE_ID);
  const progress = state
    ? getPlaceProgress(state, ACTIVE_PLACE_ID)
    : { discovered: 0, total: 0 };
  const albumSlots = state ? getAlbumSlots(state, ACTIVE_PLACE_ID) : [];
  const animals = state ? getAnimalsForPlace(state, ACTIVE_PLACE_ID) : [];
  const latestSightings = state
    ? getLatestSightings(state, ACTIVE_PLACE_ID, 5)
    : [];
  const selectedAnimal =
    animals.find((animal) => animal.id === selectedAnimalId) ?? animals[0] ?? null;
  const selectedAnimalSightings = state && selectedAnimal
    ? getSightingsForAnimal(state, selectedAnimal.id)
    : [];

  async function addExistingSighting(input: ExistingSightingInput) {
    try {
      const response = await confirmPetSighting({
        analysisId: input.analysisId,
        placeId: ACTIVE_PLACE_ID,
        decision: "existing",
        animalId: input.animalId,
        matchConfidence: input.matchConfidence,
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
    isLoadingInitialState: !hasLoadedInitialState,
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
