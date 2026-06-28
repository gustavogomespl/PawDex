import { PawPrint } from "lucide-react";
import { mediaSrc } from "@/domain/media";
import { computeRarity } from "@/domain/pawdex/rarity";
import type { AlbumSlotView } from "@/domain/pawdex/types";

type AnimalStickerCardProps = {
  slot: AlbumSlotView;
  isSelected: boolean;
  onSelectAnimal: (animalId: string) => void;
};

const SPECIES_LABEL: Record<string, string> = {
  cat: "Gato",
  dog: "Cachorro",
};

export function AnimalStickerCard({
  slot,
  isSelected,
  onSelectAnimal,
}: AnimalStickerCardProps) {
  if (!slot.animal) {
    return (
      <div className="sticker-card sticker-card--locked">
        <span className="sticker-card__jersey">{slot.slotNumber}</span>
        <div className="sticker-card__locked-icon">
          <PawPrint aria-hidden="true" size={34} />
        </div>
        <strong>???</strong>
        <span className="sticker-card__hint">por colar</span>
      </div>
    );
  }

  const animal = slot.animal;
  const rarity = computeRarity(slot.appearances);
  const species = SPECIES_LABEL[animal.species] ?? animal.species;

  return (
    <button
      className={`sticker-card sticker-card--found sticker-card--${rarity.tier} ${
        isSelected ? "sticker-card--selected" : ""
      }`}
      type="button"
      onClick={() => onSelectAnimal(animal.id)}
    >
      {rarity.isFoil ? (
        <span className="sticker-card__foil" aria-hidden="true" />
      ) : null}

      <div className="sticker-card__top">
        <div className="sticker-card__ovr">
          <strong>{rarity.overall}</strong>
          <span>{species}</span>
        </div>
        <span className="sticker-card__jersey" aria-label={`Camisa ${slot.slotNumber}`}>
          {slot.slotNumber}
        </span>
      </div>

      <div className="sticker-card__photo">
        <img src={mediaSrc(animal.primaryPhotoUrl)} alt={animal.displayName} />
      </div>

      <div className="sticker-card__body">
        <strong className="sticker-card__name">{animal.displayName}</strong>
        <div className="sticker-card__meta">
          <span className={`rarity-chip rarity-chip--${rarity.tier}`}>
            {rarity.label}
          </span>
          <span className="sticker-card__apps">
            {slot.appearances} {slot.appearances === 1 ? "aparição" : "aparições"}
          </span>
        </div>
      </div>
    </button>
  );
}
