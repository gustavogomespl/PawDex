import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getAlbumSlots, getLatestSightings } from "@/domain/pawdex/album";
import { demoState } from "@/domain/pawdex/seed";
import { AnimalTimeline } from "./AnimalTimeline";
import { LocalStats } from "./LocalStats";
import { PlaceHeader } from "./PlaceHeader";
import { StickerAlbumGrid } from "./StickerAlbumGrid";

const place = demoState.places[0];
const mingau = demoState.animals[0];

describe("album presentation components", () => {
  it("renders place header with progress and register action", () => {
    render(
      <PlaceHeader
        place={place}
        progress={{ discovered: 7, total: 12 }}
        onStartSighting={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Escritorio Centro" }),
    ).toBeInTheDocument();
    expect(screen.getByText("7/12 encontrados")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /registrar avistamento/i }),
    ).toBeInTheDocument();
  });

  it("renders discovered and locked album slots", () => {
    render(
      <StickerAlbumGrid
        slots={getAlbumSlots(demoState, place.id)}
        selectedAnimalId={null}
        onSelectAnimal={vi.fn()}
      />,
    );

    expect(screen.getByText("Mingau")).toBeInTheDocument();
    expect(screen.getAllByText("???")).toHaveLength(5);
  });

  it("renders selected animal timeline in reverse chronological order", () => {
    render(
      <AnimalTimeline
        animal={mingau}
        sightings={getLatestSightings(demoState, place.id)}
      />,
    );

    expect(screen.getByRole("heading", { name: "Mingau" })).toBeInTheDocument();
    expect(screen.getByText("Comunitario")).toBeInTheDocument();
  });

  it("renders local stats and latest sightings", () => {
    render(
      <LocalStats
        animals={demoState.animals}
        latestSightings={getLatestSightings(demoState, place.id, 2)}
      />,
    );

    expect(screen.getByText("7 animais")).toBeInTheDocument();
    expect(screen.getByText("Estacionamento")).toBeInTheDocument();
  });
});
