import type { AlbumSlotView } from "@/domain/pawdex/types";
import { AnimalStickerCard } from "./AnimalStickerCard";

type StickerAlbumGridProps = {
  slots: AlbumSlotView[];
  selectedAnimalId: string | null;
  onSelectAnimal: (animalId: string) => void;
};

export function StickerAlbumGrid({
  slots,
  selectedAnimalId,
  onSelectAnimal,
}: StickerAlbumGridProps) {
  return (
    <section className="album-section" aria-label="Album PawDex do lugar">
      <div className="section-heading">
        <h2>Figurinhas do lugar</h2>
        <span>{slots.length} slots</span>
      </div>
      <div className="sticker-grid">
        {slots.map((slot) => (
          <AnimalStickerCard
            key={slot.slotNumber}
            slot={slot}
            isSelected={slot.animal?.id === selectedAnimalId}
            onSelectAnimal={onSelectAnimal}
          />
        ))}
      </div>
    </section>
  );
}
