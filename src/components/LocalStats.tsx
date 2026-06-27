import { CalendarDays, PawPrint } from "lucide-react";
import type { Animal, Sighting } from "@/domain/pawdex/types";

type LocalStatsProps = {
  animals: Animal[];
  latestSightings: Sighting[];
};

export function LocalStats({ animals, latestSightings }: LocalStatsProps) {
  return (
    <section className="stats-band" aria-label="Resumo local">
      <div>
        <PawPrint aria-hidden="true" size={18} />
        <strong>{animals.length} animais</strong>
        <span>catalogados neste lugar</span>
      </div>
      <div>
        <CalendarDays aria-hidden="true" size={18} />
        <strong>{latestSightings.length} recentes</strong>
        <span>{latestSightings[0]?.zoneLabel ?? "Sem avistamentos recentes"}</span>
      </div>
    </section>
  );
}
