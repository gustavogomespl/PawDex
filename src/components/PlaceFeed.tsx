import { Clock3, MapPin } from "lucide-react";
import { formatSightingDateTime } from "@/domain/pawdex/date-format";
import { mediaSrc } from "@/domain/media";
import type { Animal, Sighting } from "@/domain/pawdex/types";

type PlaceFeedProps = {
  sightings: Sighting[];
  animals: Animal[];
};

export function PlaceFeed({ sightings, animals }: PlaceFeedProps) {
  if (sightings.length === 0) {
    return null;
  }

  const nameById = new Map(animals.map((animal) => [animal.id, animal.displayName]));

  return (
    <section className="feed" aria-label="Ultimos lances do lugar">
      <div className="section-heading">
        <h2>Ultimos lances</h2>
        <span>{sightings.length} recentes</span>
      </div>
      <ul className="feed-list">
        {sightings.map((sighting) => (
          <li key={sighting.id} className="feed-item">
            <img src={mediaSrc(sighting.photoUrl)} alt="" />
            <div className="feed-item__body">
              <strong>{nameById.get(sighting.animalId) ?? "Novo avistamento"}</strong>
              <span className="feed-item__meta">
                <span>
                  <MapPin aria-hidden="true" size={13} />
                  {sighting.zoneLabel}
                </span>
                <span>
                  <Clock3 aria-hidden="true" size={13} />
                  {formatSightingDateTime(sighting.takenAt)}
                </span>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
