import { Camera, LockKeyhole, Sparkles } from "lucide-react";
import type { Place, PlaceProgress } from "@/domain/pawdex/types";

type PlaceHeaderProps = {
  place: Place;
  progress: PlaceProgress;
  onStartSighting: () => void;
};

export function PlaceHeader({
  place,
  progress,
  onStartSighting,
}: PlaceHeaderProps) {
  return (
    <header className="place-header">
      <div className="place-header__copy">
        <div className="place-header__eyebrow">
          <Sparkles aria-hidden="true" size={16} />
          <span>Album local</span>
        </div>
        <h1>{place.name}</h1>
        <div className="place-header__meta">
          <span>
            {progress.discovered}/{progress.total} encontrados
          </span>
          <span className="privacy-pill">
            <LockKeyhole aria-hidden="true" size={14} />
            {place.privacyLevel}
          </span>
        </div>
      </div>
      <button className="primary-action" type="button" onClick={onStartSighting}>
        <Camera aria-hidden="true" size={18} />
        Registrar avistamento
      </button>
    </header>
  );
}
