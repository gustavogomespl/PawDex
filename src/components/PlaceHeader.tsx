import { Camera, LockKeyhole, PawPrint, Trophy } from "lucide-react";
import type { Place, PlaceProgress } from "@/domain/pawdex/types";

type PlaceHeaderProps = {
  place: Place;
  progress: PlaceProgress;
  onStartSighting: () => void;
};

const PRIVACY_LABEL: Record<string, string> = {
  private: "Privado",
  "invite-only": "Somente convidados",
  public: "Publico",
};

export function PlaceHeader({
  place,
  progress,
  onStartSighting,
}: PlaceHeaderProps) {
  const percent =
    progress.total > 0
      ? Math.round((progress.discovered / progress.total) * 100)
      : 0;

  return (
    <header className="place-header">
      <div className="place-header__crest" aria-hidden="true">
        <PawPrint size={34} />
      </div>

      <div className="place-header__copy">
        <div className="place-header__eyebrow">
          <Trophy aria-hidden="true" size={16} />
          <span>Album de figurinhas do lugar</span>
        </div>
        <h1>{place.name}</h1>

        <div className="place-header__meta">
          <span className="privacy-pill">
            <LockKeyhole aria-hidden="true" size={14} />
            {PRIVACY_LABEL[place.privacyLevel] ?? place.privacyLevel}
          </span>
        </div>

        <div className="collection-meter">
          <div className="collection-meter__track">
            <span
              className="collection-meter__fill"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="collection-meter__label">
            <strong>
              {progress.discovered}/{progress.total} encontrados
            </strong>
            <span> · album {percent}% completo</span>
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
