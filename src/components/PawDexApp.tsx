"use client";

import { useState } from "react";
import { usePawDexStore } from "@/hooks/usePawDexStore";
import { AnimalTimeline } from "./AnimalTimeline";
import { LocalStats } from "./LocalStats";
import { PlaceHeader } from "./PlaceHeader";
import { SightingComposer } from "./SightingComposer";
import { StickerAlbumGrid } from "./StickerAlbumGrid";

export function PawDexApp() {
  const [isComposing, setIsComposing] = useState(false);
  const store = usePawDexStore();

  if (!store.place) {
    return (
      <main className="app-shell">
        <p>Local nao encontrado.</p>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <PlaceHeader
        place={store.place}
        progress={store.progress}
        onStartSighting={() => {
          store.setNotice(null);
          setIsComposing(true);
        }}
      />

      {store.warning ? (
        <p className="notice notice--warning">{store.warning}</p>
      ) : null}
      {store.notice ? <p className="notice">{store.notice}</p> : null}

      {isComposing ? (
        <SightingComposer
          placeId={store.place.id}
          onWarning={store.setWarning}
          onCancel={() => setIsComposing(false)}
          onAddToExisting={async (payload) => {
            try {
              await store.addExistingSighting(payload);
              setIsComposing(false);
            } catch {
              // The store owns the user-facing warning.
            }
          }}
          onCreateNew={async (payload) => {
            try {
              await store.createNewAnimal(payload);
              setIsComposing(false);
            } catch {
              // The store owns the user-facing warning.
            }
          }}
        />
      ) : null}

      <LocalStats
        animals={store.animals}
        latestSightings={store.latestSightings}
      />

      <div className="album-layout">
        <StickerAlbumGrid
          slots={store.albumSlots}
          selectedAnimalId={store.selectedAnimal?.id ?? null}
          onSelectAnimal={store.setSelectedAnimalId}
        />
        <AnimalTimeline
          animal={store.selectedAnimal}
          sightings={store.selectedAnimalSightings}
        />
      </div>
    </main>
  );
}
