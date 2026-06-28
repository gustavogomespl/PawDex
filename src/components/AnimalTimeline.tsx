import { Clock3, MapPin } from "lucide-react";
import { formatSightingDateTime } from "@/domain/pawdex/date-format";
import { mediaSrc } from "@/domain/media";
import { computeRarity } from "@/domain/pawdex/rarity";
import type { Animal, Sighting } from "@/domain/pawdex/types";

type AnimalTimelineProps = {
  animal: Animal | null;
  sightings: Sighting[];
};

const SPECIES_LABEL: Record<string, string> = {
  cat: "Gato",
  dog: "Cachorro",
};

function formatAnimalStatus(status: Animal["status"]): string {
  switch (status) {
    case "has-owner":
      return "Tem tutor";
    case "community":
      return "Comunitario";
    case "lost":
      return "Perdido";
    case "needs-help":
      return "Precisa de ajuda";
    default:
      return "Desconhecido";
  }
}

export function AnimalTimeline({ animal, sightings }: AnimalTimelineProps) {
  if (!animal) {
    return (
      <aside className="detail-panel detail-panel--empty">
        <h2>Selecione uma figurinha</h2>
        <p>Toque em um animal encontrado para ver o card e as aparicoes.</p>
      </aside>
    );
  }

  const animalSightings = sightings.filter(
    (sighting) => sighting.animalId === animal.id,
  );
  const rarity = computeRarity(animalSightings.length);
  const species = SPECIES_LABEL[animal.species] ?? animal.species;

  return (
    <aside className="detail-panel">
      <article className={`detail-card detail-card--${rarity.tier}`}>
        {rarity.isFoil ? (
          <span className="sticker-card__foil" aria-hidden="true" />
        ) : null}
        <div className="detail-card__top">
          <div className="sticker-card__ovr">
            <strong>{rarity.overall}</strong>
            <span>{species}</span>
          </div>
          <span className={`rarity-chip rarity-chip--${rarity.tier}`}>
            {rarity.label}
          </span>
        </div>
        <img
          className="detail-card__photo"
          src={mediaSrc(animal.primaryPhotoUrl)}
          alt={animal.displayName}
        />
        <div className="detail-card__heading">
          <h2>{animal.displayName}</h2>
          <span className="status-chip">{formatAnimalStatus(animal.status)}</span>
        </div>
        {animal.description ? <p>{animal.description}</p> : null}
        <div className="tag-row">
          {animal.colorTags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      </article>

      <div className="timeline">
        <h3 className="timeline__title">
          Aparicoes ({animalSightings.length})
        </h3>
        {animalSightings.map((sighting) => (
          <article key={sighting.id} className="timeline-item">
            <img src={mediaSrc(sighting.photoUrl)} alt="" />
            <div>
              <span>
                <MapPin aria-hidden="true" size={14} />
                {sighting.zoneLabel}
              </span>
              <span>
                <Clock3 aria-hidden="true" size={14} />
                {formatSightingDateTime(sighting.takenAt)}
              </span>
            </div>
          </article>
        ))}
      </div>
    </aside>
  );
}
