# PawDex Python YOLO Detection Design

## Context

The current PawDex MVP is a Next.js web app with local browser state. The
sighting flow already accepts upload or browser camera input, shows a photo
preview, and offers mocked match suggestions for animals in the active place.

This slice adds the first real ML boundary:

- A Python service for pet detection.
- A Docker Compose setup for the web app and ML API.
- Frontend integration that analyzes the selected image before the user
  confirms an existing animal or creates a new one.

This is detection only. Individual animal re-identification, embeddings, vector
search, and model fine-tuning remain separate future slices.

## Product Goal

When a user selects or captures a sighting image, PawDex should call a local
Python YOLO service and show whether a cat or dog was detected, including a
confidence score and bounding box overlay. The user still decides what to do
next.

The intended loop is:

1. User opens the PawDex album.
2. User starts a sighting.
3. User uploads or captures a photo.
4. The frontend sends the image to the Python detector.
5. The app shows detection status and the best cat/dog result.
6. The user confirms an existing animal or creates a new animal.

## Non-Goals

This slice will not include:

- Login, backend persistence, Supabase, or object storage.
- Geofence, QR check-in, or place membership enforcement.
- CLIP, pgvector, embeddings, or individual pet re-identification.
- YOLO training or fine-tuning.
- GPU-specific Docker setup.
- Production deployment hardening.

## Architecture

The project should run locally through Docker Compose with two services:

- `web`: the existing Next.js app, served on port `3000`.
- `ml-api`: a Python FastAPI service, served on port `8000`.

The browser should not call the Python container directly. The Next.js app will
own a server route at `/api/detect` that accepts the browser upload and forwards
it to the Python service. This keeps the UI pointed at the same origin and lets
the Docker network use the service name `ml-api`.

Local development defaults:

- Browser URL: `http://localhost:3000`
- Next.js internal ML URL: `http://ml-api:8000`
- Optional host ML URL for non-Docker web dev: `http://127.0.0.1:8000`

## Python ML API

The Python service should be a small FastAPI app under `ml-api/`.

Endpoints:

- `GET /health`
  - Returns service/model readiness metadata.
- `POST /detect`
  - Accepts one image upload field named `file`.
  - Runs YOLO inference on the image.
  - Returns only cat and dog detections.

The implementation should keep YOLO behind a small detector interface so tests
can exercise filtering and response formatting without loading the real model.

The default model should be lightweight and configurable by environment:

- `PAWDEX_YOLO_MODEL`, defaulting to `yolo11n.pt`.
- `PAWDEX_YOLO_CONFIDENCE`, defaulting to `0.35`.

The service should load the model lazily or at startup through one clear
factory, not inside route handlers for every request.

## Detection Response Contract

The API response should be stable and simple:

```json
{
  "detections": [
    {
      "species": "cat",
      "label": "cat",
      "confidence": 0.87,
      "box": {
        "x1": 10.0,
        "y1": 20.0,
        "x2": 300.0,
        "y2": 420.0
      }
    }
  ],
  "bestDetection": {
    "species": "cat",
    "label": "cat",
    "confidence": 0.87,
    "box": {
      "x1": 10.0,
      "y1": 20.0,
      "x2": 300.0,
      "y2": 420.0
    }
  }
}
```

Rules:

- `species` is only `cat` or `dog`.
- `confidence` is a number between `0` and `1`.
- Box coordinates are pixel coordinates relative to the submitted image.
- `bestDetection` is the highest-confidence cat/dog detection, or `null`.
- Non-pet YOLO classes are filtered out before returning.

## Frontend Integration

The existing `SightingComposer` should keep upload and browser camera behavior.
After a photo is selected, it should call `/api/detect` and show a compact
detection panel:

- Loading: `Analisando imagem...`
- Success: `Gato detectado, 87%` or `Cachorro detectado, 87%`
- Empty: `Nenhum gato ou cachorro detectado.`
- Error: `Nao foi possivel analisar a imagem agora.`

If a cat or dog is detected, the selected species control should default to the
detected species when creating a new animal. The user can still change it.

The image preview should draw the best bounding box over the selected photo.
The UI should not block confirmation if detection fails; YOLO assists the user,
but does not become a hard requirement.

## Docker

The root should include a `compose.yaml` with:

- `web`
  - Builds the Next.js app.
  - Exposes `3000:3000`.
  - Sets `ML_API_URL=http://ml-api:8000`.
  - Depends on `ml-api`.
- `ml-api`
  - Builds `ml-api/`.
  - Exposes `8000:8000`.
  - Provides a healthcheck against `/health`.

Dockerfiles should be development-friendly and deterministic enough for the MVP:

- `Dockerfile` for the web app.
- `ml-api/Dockerfile` for the Python service.
- `.dockerignore` to avoid copying `node_modules`, `.next`, caches, and local
  generated files.

The README should document:

- `docker compose up --build`
- Web URL.
- ML API health URL.
- Non-Docker fallback commands for web and Python API.

## Error Handling

Python API:

- Reject missing files with FastAPI validation.
- Reject unsupported image content with a `400` response.
- Return an empty detection list when the model finds no cats or dogs.
- Return structured JSON without leaking stack traces.

Next.js route:

- Return `502` if the Python service is unavailable.
- Preserve the stable frontend-facing response shape where possible.

Frontend:

- Show a non-blocking warning on detection errors.
- Keep the user able to create a new animal manually.
- Avoid saying the animal identity is certain.

## Testing Strategy

Python tests should cover:

- Cat and dog detections pass through.
- Non-pet classes are filtered out.
- `bestDetection` selects the highest-confidence pet.
- Invalid image upload returns an error.
- `/health` returns service metadata.

Frontend tests should cover:

- `/api/detect` forwards an image upload to the configured ML API.
- `SightingComposer` shows loading, success, empty, and error detection states.
- Detected species defaults the new-animal species selector.
- Existing manual sighting flow still works when detection fails.

Docker should be verified with:

- `docker compose build`
- `docker compose up`
- `curl http://localhost:8000/health`
- Browser or HTTP check for `http://localhost:3000`

## Future Work

After this slice is stable, the next ML steps are:

- Crop the detected animal before saving or matching.
- Generate visual embeddings for the crop.
- Store embeddings per sighting/animal.
- Search candidates inside the current place only.
- Add review flow for duplicate or uncertain matches.
