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
- Python YOLO service for cat/dog detection.
- Mock match suggestions restricted to the active place.

## Out Of Scope For This Slice

- Real authentication.
- Supabase or backend APIs.
- Real geofence or QR check-in.
- Pet re-identification and embeddings.
- Native mobile app.

## Docker

```bash
docker compose up --build
```

Open:

- Web app: http://localhost:3000
- ML health: http://localhost:8000/health

The first YOLO request may download the configured model. Override it with:

```bash
PAWDEX_YOLO_MODEL=yolov8n.pt docker compose up --build
```

## Scripts

```bash
npm install
npm run dev
npm run test
npm run build
```

Open the local dev URL printed by Next.js after `npm run dev`.

## Python ML API Without Docker

```bash
cd ml-api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
