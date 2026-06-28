import { PawPrint } from "lucide-react";
import { mediaSrc } from "@/domain/media";
import type { AlbumSlotView } from "@/domain/pawdex/types";

type AnimalStickerCardProps = {
  slot: AlbumSlotView;
  isSelected: boolean;
  onSelectAnimal: (animalId: string) => void;
};

export function AnimalStickerCard({
  slot,
  isSelected,
  onSelectAnimal,
}: AnimalStickerCardProps) {
  if (!slot.animal) {
    return (
      <div className="sticker-card sticker-card--locked">
        <span className="sticker-card__number">#{slot.slotNumber}</span>
        <div className="sticker-card__locked-icon">
          <PawPrint aria-hidden="true" size={34} />
        </div>
        <strong>???</strong>
      </div>
    );
  }

  return (
    <button
      className={`sticker-card sticker-card--found ${
        isSelected ? "sticker-card--selected" : ""
      }`}
      type="button"
      onClick={() => onSelectAnimal(slot.animal!.id)}
    >
      <span className="sticker-card__number">#{slot.slotNumber}</span>
      <img src={mediaSrc(slot.animal.primaryPhotoUrl)} alt={slot.animal.displayName} />
      <strong>{slot.animal.displayName}</strong>
      <span>{slot.animal.rarityLabel}</span>
    </button>
  );
}
