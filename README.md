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

- Real geofence or QR check-in.
- Production OAuth/email authentication.
- Cloud object storage.
- Model fine-tuning for pet re-identification.
- Native mobile app.

## Local Docker Stack

```bash
docker compose up --build
```

Services:

- Web app: http://localhost:3000
- ML API: internal Compose network only, proxied by Next.js.
- Postgres + pgvector: internal Compose network only.
- MinIO object storage: internal Compose network only.

The stack has development defaults, so a clean checkout can run without a
local `.env`. Copy `.env.example` to `.env` when you want stable secrets or
custom settings.

The database initializes from `db/init`, then the ML API runs Alembic
migrations on startup. To reset local database and object-storage data:

```bash
docker compose down -v
docker compose up --build
```

Pet matching uses YOLO to detect and crop cats/dogs, MobileNetV3 Small to
generate a 576-dimensional vector, and pgvector cosine distance to search
embeddings inside the current place.

The Docker image pre-bakes the configured YOLO and MobileNet weights so runtime
requests do not need model downloads. Override the YOLO model at build time
with:

```bash
PAWDEX_YOLO_MODEL=yolov8n.pt docker compose up --build
```

Useful checks:

```bash
curl http://localhost:3000
curl "http://localhost:3000/api/pawdex/state?placeId=place-office-centro"
docker compose exec ml-api curl -f http://localhost:8000/health
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
