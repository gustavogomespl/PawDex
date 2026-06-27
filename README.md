# PawDex

PawDex is a local pet album prototype for specific places. This MVP opens on a
demo office and lets you browse a sticker-album collection, register a sighting
with upload or browser camera, and save the result locally in the browser.

## MVP Scope

- Next.js web app.
- Demo place: Escritorio Centro.
- Local seeded data with localStorage persistence.
- Sticker-album PawDex home.
- Upload and browser camera sighting input.
- Mock match suggestions restricted to the active place.

## Out Of Scope For This Slice

- Real authentication.
- Supabase or backend APIs.
- Real geofence or QR check-in.
- Real ML detection or re-identification.
- Native mobile app.

## Scripts

```bash
npm install
npm run dev
npm run test
npm run build
```

Open the local dev URL printed by Next.js after `npm run dev`.
