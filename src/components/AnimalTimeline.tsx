import { Clock3, MapPin } from "lucide-react";
import type { Animal, Sighting } from "@/domain/pawdex/types";

type AnimalTimelineProps = {
  animal: Animal | null;
  sightings: Sighting[];
};

export function AnimalTimeline({ animal, sightings }: AnimalTimelineProps) {
  if (!animal) {
    return (
      <aside className="detail-panel">
        <h2>Selecione uma figurinha</h2>
        <p>Toque em um animal encontrado para ver historico e aparicoes.</p>
      </aside>
    );
  }

  return (
    <aside className="detail-panel">
      <img className="detail-panel__photo" src={animal.primaryPhotoUrl} alt="" />
      <div className="detail-panel__heading">
        <h2>{animal.displayName}</h2>
        <span>{animal.status}</span>
      </div>
      <p>{animal.description}</p>
      <div className="tag-row">
        {animal.colorTags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
      <div className="timeline">
        {sightings
          .filter((sighting) => sighting.animalId === animal.id)
          .map((sighting) => (
            <article key={sighting.id} className="timeline-item">
              <img src={sighting.photoUrl} alt="" />
              <div>
                <span>
                  <MapPin aria-hidden="true" size={14} />
                  {sighting.zoneLabel}
                </span>
                <span>
                  <Clock3 aria-hidden="true" size={14} />
                  {new Intl.DateTimeFormat("pt-BR", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(sighting.takenAt))}
                </span>
              </div>
            </article>
          ))}
      </div>
    </aside>
  );
}
