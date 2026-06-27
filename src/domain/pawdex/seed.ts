import type { PawDexState } from "./types";

const catOne =
  "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=800&q=80";
const catTwo =
  "https://images.unsplash.com/photo-1573865526739-10659fec78a5?auto=format&fit=crop&w=800&q=80";
const catThree =
  "https://images.unsplash.com/photo-1495360010541-f48722b34f7d?auto=format&fit=crop&w=800&q=80";
const dogOne =
  "https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=800&q=80";
const dogTwo =
  "https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=800&q=80";

export const demoState: PawDexState = {
  places: [
    {
      id: "place-office-centro",
      name: "Escritorio Centro",
      type: "office",
      privacyLevel: "invite-only",
      albumTotalSlots: 12,
    },
  ],
  animals: [
    {
      id: "animal-mingau",
      placeId: "place-office-centro",
      species: "cat",
      displayName: "Mingau",
      status: "community",
      description: "Gato claro que costuma aparecer perto da recepcao.",
      colorTags: ["branco", "creme"],
      rarityLabel: "Comum",
      primaryPhotoUrl: catOne,
      firstSeenAt: "2026-05-02T12:00:00.000Z",
      lastSeenAt: "2026-06-24T13:20:00.000Z",
    },
    {
      id: "animal-caramelo",
      placeId: "place-office-centro",
      species: "dog",
      displayName: "Caramelo",
      status: "has-owner",
      description: "Cachorro simpatico visto no jardim lateral.",
      colorTags: ["caramelo"],
      rarityLabel: "Ocasional",
      primaryPhotoUrl: dogOne,
      firstSeenAt: "2026-05-09T14:10:00.000Z",
      lastSeenAt: "2026-06-21T11:05:00.000Z",
    },
    {
      id: "animal-pretinha",
      placeId: "place-office-centro",
      species: "cat",
      displayName: "Pretinha",
      status: "unknown",
      description: "Gata escura e discreta, geralmente vista no estacionamento.",
      colorTags: ["preto"],
      rarityLabel: "Timida",
      primaryPhotoUrl: catTwo,
      firstSeenAt: "2026-05-17T09:30:00.000Z",
      lastSeenAt: "2026-06-26T18:25:00.000Z",
    },
    {
      id: "animal-thor",
      placeId: "place-office-centro",
      species: "dog",
      displayName: "Thor",
      status: "has-owner",
      description: "Visitante de pequeno porte que aparece com um colaborador.",
      colorTags: ["marrom", "branco"],
      rarityLabel: "Visitante",
      primaryPhotoUrl: dogTwo,
      firstSeenAt: "2026-06-03T16:15:00.000Z",
      lastSeenAt: "2026-06-25T15:00:00.000Z",
    },
    {
      id: "animal-sombra",
      placeId: "place-office-centro",
      species: "cat",
      displayName: "Sombra",
      status: "community",
      description: "Gato cinza que circula perto do bicicletario.",
      colorTags: ["cinza"],
      rarityLabel: "Raro",
      primaryPhotoUrl: catThree,
      firstSeenAt: "2026-06-01T10:00:00.000Z",
      lastSeenAt: "2026-06-12T10:45:00.000Z",
    },
    {
      id: "animal-luna",
      placeId: "place-office-centro",
      species: "cat",
      displayName: "Luna",
      status: "unknown",
      description: "Gata rajada que aparece perto das plantas.",
      colorTags: ["rajado", "dourado"],
      rarityLabel: "Ocasional",
      primaryPhotoUrl: catOne,
      firstSeenAt: "2026-05-27T12:30:00.000Z",
      lastSeenAt: "2026-06-18T12:40:00.000Z",
    },
    {
      id: "animal-bento",
      placeId: "place-office-centro",
      species: "dog",
      displayName: "Bento",
      status: "has-owner",
      description: "Cachorro pequeno visto em dias de visita pet-friendly.",
      colorTags: ["preto", "branco"],
      rarityLabel: "Lenda local",
      primaryPhotoUrl: dogTwo,
      firstSeenAt: "2026-06-06T10:20:00.000Z",
      lastSeenAt: "2026-06-06T10:20:00.000Z",
    },
  ],
  sightings: [
    {
      id: "sighting-mingau-001",
      placeId: "place-office-centro",
      animalId: "animal-mingau",
      photoUrl: catOne,
      zoneLabel: "Recepcao",
      takenAt: "2026-06-24T13:20:00.000Z",
      matchConfidence: 0.88,
      reviewStatus: "confirmed",
    },
    {
      id: "sighting-caramelo-001",
      placeId: "place-office-centro",
      animalId: "animal-caramelo",
      photoUrl: dogOne,
      zoneLabel: "Jardim lateral",
      takenAt: "2026-06-21T11:05:00.000Z",
      matchConfidence: 0.82,
      reviewStatus: "confirmed",
    },
    {
      id: "sighting-thor-002",
      placeId: "place-office-centro",
      animalId: "animal-thor",
      photoUrl: dogTwo,
      zoneLabel: "Andar 3",
      takenAt: "2026-06-25T15:00:00.000Z",
      matchConfidence: 0.75,
      reviewStatus: "confirmed",
    },
    {
      id: "sighting-pretinha-003",
      placeId: "place-office-centro",
      animalId: "animal-pretinha",
      photoUrl: catTwo,
      zoneLabel: "Estacionamento",
      takenAt: "2026-06-26T18:25:00.000Z",
      matchConfidence: 0.79,
      reviewStatus: "confirmed",
    },
  ],
  albumSlots: Array.from({ length: 12 }, (_, index) => {
    const animalIds = [
      "animal-mingau",
      "animal-caramelo",
      "animal-pretinha",
      "animal-thor",
      "animal-sombra",
      "animal-luna",
      "animal-bento",
    ];
    const animalId = animalIds[index] ?? null;

    return {
      slotNumber: index + 1,
      placeId: "place-office-centro",
      animalId,
      isDiscovered: animalId !== null,
    };
  }),
};
