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

export function usePawDexStore(placeId: string) {
  const [state, setState] = useState<PawDexState | null>(null);
  const [stateSource, setStateSource] = useState<"remote" | "local">("remote");
  const [hasLoadedInitialState, setHasLoadedInitialState] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedAnimalId, setSelectedAnimalId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setHasLoadedInitialState(false);

    async function loadInitialState() {
      try {
        const response = await fetch(
          `/api/pawdex/state?placeId=${encodeURIComponent(placeId)}`,
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
          getSelectedAnimalId(remoteState, currentAnimalId, placeId),
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
          getSelectedAnimalId(result.state, currentAnimalId, placeId),
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
  }, [placeId]);

  useEffect(() => {
    if (!hasLoadedInitialState || !state) {
      return;
    }

    // Postgres is authoritative. Only persist to localStorage on the offline
    // fallback so remote state (with photo data URLs) never fills the cache.
    if (stateSource !== "local") {
      return;
    }

    const saveWarning = savePawDexState(state);

    if (saveWarning) {
      setWarning(saveWarning);
    }
  }, [hasLoadedInitialState, state, stateSource]);

  const place = state?.places.find((candidate) => candidate.id === placeId);
  const progress = state
    ? getPlaceProgress(state, placeId)
    : { discovered: 0, total: 0 };
  const albumSlots = state ? getAlbumSlots(state, placeId) : [];
  const animals = state ? getAnimalsForPlace(state, placeId) : [];
  const latestSightings = state
    ? getLatestSightings(state, placeId, 5)
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
        placeId,
        decision: "existing",
        animalId: input.animalId,
        matchConfidence: input.matchConfidence,
        photoUrl: input.photoUrl,
        zoneLabel: "Area comum",
      });

      setState(response.state);
      setStateSource("remote");
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
        placeId,
        decision: "new",
        displayName: input.displayName,
        species: input.species,
        photoUrl: input.photoUrl,
        zoneLabel: "Area comum",
      });

      setState(response.state);
      setStateSource("remote");
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
  placeId: string,
): string | null {
  const animals = getAnimalsForPlace(state, placeId);

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
