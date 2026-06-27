const PAWDEX_PLACE_TIME_ZONE = "America/Sao_Paulo";

const sightingDateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: PAWDEX_PLACE_TIME_ZONE,
});

export function formatSightingDateTime(takenAt: string): string {
  return sightingDateTimeFormatter.format(new Date(takenAt));
}
