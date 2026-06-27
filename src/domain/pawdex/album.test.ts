import { describe, expect, it } from "vitest";
import { getAlbumSlots, getLatestSightings, getPlaceProgress } from "./album";
import { demoState } from "./seed";

describe("album selectors", () => {
  it("counts discovered slots and total slots for a place", () => {
    expect(getPlaceProgress(demoState, "place-office-centro")).toEqual({
      discovered: 7,
      total: 12,
    });
  });

  it("returns album slots ordered by slot number with animal data attached", () => {
    const slots = getAlbumSlots(demoState, "place-office-centro");

    expect(slots).toHaveLength(12);
    expect(slots[0]).toMatchObject({
      slotNumber: 1,
      isDiscovered: true,
      animal: expect.objectContaining({ displayName: "Mingau" }),
    });
    expect(slots[11]).toMatchObject({
      slotNumber: 12,
      isDiscovered: false,
      animal: null,
    });
  });

  it("returns latest sightings for the active place in reverse chronological order", () => {
    const sightings = getLatestSightings(demoState, "place-office-centro", 2);

    expect(sightings.map((sighting) => sighting.id)).toEqual([
      "sighting-pretinha-003",
      "sighting-thor-002",
    ]);
  });
});
