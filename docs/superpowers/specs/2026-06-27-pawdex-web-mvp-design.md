# PawDex Web MVP Design

## Context

The PawDex repository currently has only the initial README. The first
implementation should therefore establish a small, testable web app rather than
commit to mobile, Supabase, geofencing, or ML infrastructure too early.

This spec defines the first product slice:

- Web MVP in Next.js and TypeScript.
- Local browser data only.
- A pre-populated demo place.
- A sticker-album style PawDex as the home screen.
- Upload and browser camera entry points for new sightings.

## Product Goal

Validate the core product loop:

1. A user opens a specific place.
2. The user sees that place's pet collection.
3. The user registers a pet sighting with a photo.
4. The user confirms whether it belongs to an existing animal or creates a new
   animal.
5. The local album and animal timeline update immediately.

The prototype should make the "place -> animals -> sightings -> collection"
model obvious without requiring authentication, real geolocation, or ML.

## Non-Goals

This first slice will not include:

- Real login or user accounts.
- Supabase, Postgres, Storage, PostGIS, or pgvector.
- Real QR check-in or geofencing.
- YOLO, MediaPipe, CLIP, or any real ML inference.
- Public sharing, moderation queues, or admin roles.
- Native mobile or Flutter.

## UX Direction

The selected visual direction is a collectible album, similar in spirit to a
World Cup sticker album.

The home screen should open on a demo place, for example "Escritorio Centro".
The main surface is the local PawDex album:

- Progress summary, such as "7/12 encontrados".
- Sticker slots for known animals.
- Locked or unknown slots with silhouettes or "???".
- Cards that feel collectible, but still readable and practical.
- A persistent action to register a sighting.

The tone should be playful and memorable, but not a heavy game. The app should
still feel trustworthy for offices, campuses, condominiums, and private places.

## Core Screens

### Place Album Home

Shows the demo place, local progress, animal sticker grid, latest sightings, and
primary action to register a sighting.

Primary behaviors:

- Display seeded animals and empty album slots.
- Show found count and total slots.
- Select an animal to view its timeline/details.
- Start a new sighting flow.

### Sighting Composer

Lets the user add an image using either:

- Browser camera capture.
- Image upload fallback.

After image selection, the app shows a local suggestion panel. The suggestion is
mocked in this MVP and should be presented carefully as a possible match, not a
guaranteed identification.

Primary decisions:

- Add sighting to an existing animal.
- Create a new animal from the photo.
- Cancel and return to the album.

### Animal Detail / Timeline

Shows the selected animal's sticker card, basic metadata, and sighting history.

Primary behaviors:

- Show name, species, status, rarity/frequency label, and primary photo.
- List sightings in reverse chronological order.
- Surface latest zone or location label if available in seed data.

## Data Model

The MVP uses local TypeScript types and seeded data.

### Place

- `id`
- `name`
- `type`
- `privacyLevel`
- `albumTotalSlots`

### Animal

- `id`
- `placeId`
- `species`
- `displayName`
- `status`
- `description`
- `colorTags`
- `rarityLabel`
- `primaryPhotoUrl`
- `firstSeenAt`
- `lastSeenAt`

### Sighting

- `id`
- `placeId`
- `animalId`
- `photoUrl`
- `zoneLabel`
- `takenAt`
- `matchConfidence`
- `reviewStatus`

### AlbumSlot

- `slotNumber`
- `animalId`
- `isDiscovered`

## State And Persistence

State should live behind a small local store/hook rather than directly inside
page components.

Responsibilities:

- Load seeded demo data when no local data exists.
- Persist changes to `localStorage`.
- Add a sighting to an existing animal.
- Create a new animal and assign it to the next available album slot.
- Recalculate place progress from album slots.

This boundary should make it straightforward to replace local persistence with a
backend API later.

## Media Handling

For this browser-only prototype, selected images should be converted to local
data URLs before being saved. This keeps uploaded and camera-captured photos
available after a page refresh without requiring object storage.

This is acceptable for demo-scale data only. A later backend version should move
photos to object storage and keep only URLs plus metadata in the app database.

## Suggested Component Boundaries

- `PlaceHeader`: place name, privacy/type label, album progress.
- `StickerAlbumGrid`: ordered album slots and animal cards.
- `AnimalStickerCard`: collectible card for discovered and undiscovered slots.
- `SightingComposer`: camera/upload/photo preview and match decision UI.
- `AnimalTimeline`: selected animal history.
- `LocalStats`: small summary of total animals, latest sightings, and progress.

Components should remain presentation-focused. Collection updates and persistence
belong in the store/hook.

## Mock Matching

The MVP should include a fake match suggestion so the future ML flow is visible.

Rules:

- Restrict suggestions to animals in the current place.
- Return one or more existing animals from seeded data.
- Label the result as "possivel match".
- Let the user confirm existing animal or create a new one.

No real image analysis is required.

## Error Handling

The app should handle:

- Camera permission denied: show upload fallback.
- No camera device available: show upload fallback.
- Invalid or missing image file: keep the user in the composer with a clear
  message.
- LocalStorage read/write failure: keep in-memory state for the session and show
  a non-blocking warning.
- No empty album slots: still allow a new animal, expanding total slots or adding
  it after the current album range.

## Testing Strategy

Use test-first implementation for behavior that changes state.

Minimum tests:

- Collection progress counts discovered slots and total slots.
- Seed data loads when localStorage is empty.
- Existing localStorage data is used instead of seed data.
- Adding a sighting to an existing animal updates sightings and `lastSeenAt`.
- Creating a new animal assigns it to the next available slot and updates
  progress.
- Mock match suggestions only return animals from the active place.

UI-level tests should cover the main flow after the core state behavior is in
place:

- User can open the album home.
- User can start sighting flow.
- User can upload/select an image.
- User can add the sighting to an existing animal.
- User can create a new animal from the selected image.

## Implementation Notes

Recommended scaffold:

- Next.js App Router.
- TypeScript.
- A small local test setup suitable for pure functions and React components.
- No backend service in the first slice.

The first implementation should favor a complete, polished demo loop over
premature infrastructure.

## Closed Decisions

All blocking design decisions for the first slice are closed:

- Platform: Next.js web MVP.
- Data: local mock data with localStorage persistence.
- Media input: browser camera and upload.
- Home: place collection album.
- Initial content: populated demo place.
- Visual direction: collectible sticker album inspired by World Cup albums.
