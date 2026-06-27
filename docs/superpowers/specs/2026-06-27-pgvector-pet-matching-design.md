# PawDex Pgvector Pet Matching Design

## Context

The current PawDex MVP has three important pieces already in place:

- A Next.js web app with a local sticker-album PawDex experience.
- A Python FastAPI `ml-api` service that detects cats and dogs with YOLO.
- Docker Compose for running the web and ML services together.

The app still stores animals and sightings in browser `localStorage`. Match
suggestions are not real identity matching yet; they are local demo suggestions.
This slice promotes the matching flow to persistent Postgres data with
`pgvector`, so uploaded photos can be compared against known animals for the
current place.

## Product Goal

When a user uploads or captures a pet sighting, PawDex should suggest whether the
animal likely already exists in that place's PawDex.

The intended loop is:

1. User uploads or captures a sighting photo.
2. `ml-api` detects the pet with YOLO and crops the animal.
3. `ml-api` generates a visual embedding for the crop.
4. The embedding is compared against stored embeddings for the same `place_id`.
5. The app shows the top possible matches with similarity scores.
6. The user confirms an existing animal, creates a new animal, or skips the
   suggestion.
7. The sighting and embedding are persisted in Postgres.

The product wording must remain careful: the system suggests possible matches;
it does not claim certain identification.

## Non-Goals

This slice will not include:

- Production authentication or place membership enforcement.
- Real object storage for original images.
- Mobile Flutter integration.
- Fine-tuning a pet re-identification model.
- Human moderation queues or duplicate merge workflows.
- GPU-specific deployment.
- Supabase-managed infrastructure.

## Recommended Approach

Use a Dockerized Postgres database with the `pgvector` extension enabled.
`ml-api` owns detection, image cropping, embedding generation, vector insertion,
and similarity search. The Next.js app calls its own API routes, and those routes
forward analysis and confirmation requests to `ml-api`.

This is larger than an in-memory matching MVP, but it gives the project the
right product shape now: animals, sightings, and embeddings become durable data
instead of browser-only demo state.

## Alternatives Considered

### In-memory embedding cache

This would compare the uploaded image to candidate photos sent by the browser.
It is fast to build and avoids database work, but it is temporary and does not
move PawDex toward persistent animal identity.

### CLIP or OpenCLIP embeddings

CLIP-style embeddings are useful for broad semantic similarity, but they are
heavier and not necessarily better for distinguishing individual cats or dogs.
They remain a good later experiment once the persistence and feedback loop exist.

### Postgres + pgvector

This is the selected direction. It adds more infrastructure, but it gives the
app a real vector search path and a durable dataset for future model improvement.

## Architecture

Docker Compose should run three services:

- `web`: Next.js app on port `3000`.
- `ml-api`: FastAPI service on port `8000`.
- `db`: Postgres with pgvector enabled.

The browser should continue calling the Next.js app on the same origin. Next.js
API routes should call `ml-api` over the Compose network. `ml-api` should use a
database URL such as `postgresql://pawdex:pawdex@db:5432/pawdex`.

The database should be initialized through SQL migrations committed to the repo,
not by ad hoc manual commands.

## Database Schema

The first persistent schema should cover only what the matching flow needs.

### `places`

- `id`
- `name`
- `type`
- `privacy_level`
- `created_at`

### `animals`

- `id`
- `place_id`
- `species`
- `display_name`
- `status`
- `description`
- `color_tags`
- `primary_photo_url`
- `first_seen_at`
- `last_seen_at`
- `created_at`

### `sightings`

- `id`
- `place_id`
- `animal_id`
- `photo_url`
- `species`
- `zone_label`
- `taken_at`
- `detector_confidence`
- `match_confidence`
- `created_at`

### `animal_embeddings`

- `id`
- `place_id`
- `animal_id`
- `sighting_id`
- `model_version`
- `embedding vector(576)`
- `quality_score`
- `created_at`

`576` is the selected embedding size for the first model version:
`torchvision-mobilenet-v3-small-imagenet1k-v1`. The embedding model and vector
dimension are part of the API contract.

### `match_suggestions`

- `id`
- `place_id`
- `sighting_id`
- `candidate_animal_id`
- `score`
- `status`
- `created_at`

`status` should start with `suggested`, `confirmed`, `rejected`, and `unknown`.

## Vector Search

Enable pgvector with:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Use cosine distance for the first version. Query similar animals only inside the
current place:

```sql
SELECT animal_id, MIN(embedding <=> $1) AS distance
FROM animal_embeddings
WHERE place_id = $2
GROUP BY animal_id
ORDER BY distance ASC
LIMIT 3;
```

The API should expose similarity as `1 - distance`, clamped to `0..1` for UI
display. If the database grows enough to need approximate search, add an HNSW
index using cosine ops:

```sql
CREATE INDEX animal_embeddings_embedding_hnsw
ON animal_embeddings
USING hnsw (embedding vector_cosine_ops);
```

For the local MVP dataset, exact search is acceptable before indexing.

## Embedding Model

Use `torchvision` MobileNetV3 Small inside `ml-api` for the first persistent
version. The service should remove the classifier head, global-pool the feature
map, and store a 576-dimensional vector. This keeps the Docker image close to
the current Python stack and avoids adding CLIP dependencies before the product
loop is validated.

The embedding module should:

- Receive the YOLO crop, not the full image.
- Normalize and resize the crop consistently.
- Produce one fixed-size vector.
- L2-normalize the vector before storing it.
- Expose a `model_version` string in every stored embedding.

This is not expected to solve perfect pet re-identification. It is a pragmatic
baseline that creates the correct feedback loop and dataset.

## API Contracts

### `POST /analyze-sighting`

Accepts:

- `file`: image upload.
- `place_id`: current place.

Returns:

```json
{
  "detection": {
    "species": "cat",
    "confidence": 0.87,
    "box": {
      "x1": 10.0,
      "y1": 20.0,
      "x2": 300.0,
      "y2": 420.0
    }
  },
  "embedding": {
    "modelVersion": "torchvision-mobilenet-v3-small-imagenet1k-v1",
    "qualityScore": 0.82
  },
  "matches": [
    {
      "animalId": "animal-mingau",
      "displayName": "Mingau",
      "species": "cat",
      "score": 0.84
    }
  ],
  "recommendation": "possible_existing"
}
```

`recommendation` should be one of:

- `possible_existing`
- `probably_new`
- `no_pet_detected`
- `needs_better_photo`

### `POST /confirm-sighting`

Accepts one of two decisions:

- Existing animal: save sighting against `animal_id`.
- New animal: create animal, save sighting, and attach the embedding.

The confirmation endpoint persists the final sighting and the embedding. The
analysis endpoint may keep the embedding in a short-lived pending state, but it
should not permanently create an animal without user confirmation.

## Frontend Behavior

`SightingComposer` should replace the current mocked suggestion list with ML
matches from `/api/analyze-sighting`.

UI states:

- Loading: `Analisando foto e comparando com a PawDex...`
- Strong possible match: `Parece ser Mingau, 84% de similaridade.`
- Weak match: `Talvez seja novo. Os animais mais parecidos foram...`
- Empty detection: `Nenhum gato ou cachorro detectado.`
- Poor quality: `Foto fraca para comparar. Tente outra imagem ou cadastre manualmente.`
- Error: `Nao foi possivel comparar agora. Voce ainda pode salvar manualmente.`

The UI must keep the confirmation buttons explicit:

- Add to an existing animal.
- Create a new animal.
- Cancel.

## Data Migration Strategy

The existing seed data should be inserted into Postgres during local database
initialization. Because current seed photos are remote URLs, the first migration
can create animals without embeddings. Embeddings for seed animals can be
generated by a small backfill command in `ml-api`.

For local user-uploaded images, the first version may continue storing photo
data URLs or simple URLs in Postgres. Real object storage should be a later
slice.

## Error Handling

- If Postgres is unavailable, `ml-api` should return a clear service error and
  the frontend should allow manual saving only if persistence is available.
- If YOLO finds no pet, do not generate an embedding.
- If embedding generation fails, keep detection results but do not show vector
  match suggestions.
- If vector search has no candidates in the place, return an empty match list
  and recommend `probably_new`.
- If the uploaded image is too small or blurry, return `needs_better_photo` when
  quality checks fail.

## Testing

Python tests should cover:

- pgvector SQL/query construction through repository-level tests.
- Matching restricted to the same `place_id`.
- Cosine distance converted into UI similarity scores.
- Analyze response when no pet is detected.
- Analyze response when matches are found.
- Confirmation flow for existing animal and new animal.

Frontend tests should cover:

- Sighting composer showing returned match candidates.
- Strong match wording.
- Probably-new wording.
- Error fallback.
- Confirming an existing animal through the new API boundary.
- Creating a new animal through the new API boundary.

Docker verification should cover:

- `docker compose up --build` starts `web`, `ml-api`, and `db`.
- `ml-api` health check confirms database connectivity.
- A sample analyze request returns a valid response.

## Rollout Notes

This slice intentionally changes PawDex from browser-only state to persistent
state for the matching flow. If the implementation becomes too large, the first
cut should prioritize:

1. Dockerized Postgres with pgvector.
2. Migrations and seed data.
3. Persisted animals and sightings.
4. Embedding generation and vector search.
5. Frontend display of match suggestions.

Authentication, object storage, moderation, and model fine-tuning should stay
outside this implementation.
