# PawDex

PawDex is a local pet album prototype for specific places. This MVP opens on a
demo office and lets you browse a sticker-album collection, register a sighting
with upload or browser camera, compare the photo against known animals with a
vector-search matching flow, and confirm the sighting into a local Postgres
database.

## MVP Scope

- Next.js web app.
- Demo place: Escritorio Centro.
- Dockerized Postgres with pgvector seed data.
- Sticker-album PawDex home.
- Upload and browser camera sighting input.
- Python ML API for cat/dog detection, image embeddings, pgvector search, and
  confirmation.
- Match suggestions restricted to the active place.

## Out Of Scope For This Slice

- Real authentication.
- Real geofence or QR check-in.
- Supabase or cloud object storage.
- Model fine-tuning for pet re-identification.
- Native mobile app.

## Local Docker Stack

```bash
docker compose up --build
```

Services:

- Web app: http://localhost:3000
- ML API: http://localhost:8000
- Postgres + pgvector: localhost:5432

The database initializes from `db/init`. To reset local database data:

```bash
docker compose down -v
docker compose up --build
```

Pet matching uses YOLO to detect and crop cats/dogs, MobileNetV3 Small to
generate a 576-dimensional vector, and pgvector cosine distance to search
embeddings inside the current place.

The first YOLO request may download the configured model. Override it with:

```bash
PAWDEX_YOLO_MODEL=yolov8n.pt docker compose up --build
```

Useful checks:

```bash
curl http://localhost:8000/health
curl "http://localhost:3000/api/pawdex/state?placeId=place-office-centro"
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
pip install -r requirements-torch.txt
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
