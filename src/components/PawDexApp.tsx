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
          suggestions={store.suggestions}
          onWarning={store.setWarning}
          onCancel={() => setIsComposing(false)}
          onAddToExisting={(payload) => {
            store.addExistingSighting(payload);
            setIsComposing(false);
          }}
          onCreateNew={(payload) => {
            store.createNewAnimal(payload);
            setIsComposing(false);
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
