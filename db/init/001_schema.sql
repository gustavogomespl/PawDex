CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS places (
  id text PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL,
  privacy_level text NOT NULL CHECK (privacy_level IN ('private', 'invite-only', 'public')),
  album_total_slots integer NOT NULL DEFAULT 12 CHECK (album_total_slots > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS animals (
  id text PRIMARY KEY,
  place_id text NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  species text NOT NULL CHECK (species IN ('cat', 'dog')),
  display_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('unknown', 'has-owner', 'community', 'lost', 'needs-help')),
  description text NOT NULL DEFAULT '',
  color_tags text[] NOT NULL DEFAULT '{}',
  rarity_label text NOT NULL DEFAULT 'Ocasional',
  primary_photo_url text NOT NULL,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, place_id),
  UNIQUE (id, place_id, species)
);

CREATE TABLE IF NOT EXISTS sightings (
  id text PRIMARY KEY,
  place_id text NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  animal_id text NOT NULL,
  photo_url text NOT NULL,
  species text NOT NULL CHECK (species IN ('cat', 'dog')),
  zone_label text NOT NULL DEFAULT 'Area comum',
  taken_at timestamptz NOT NULL,
  detector_confidence double precision CHECK (detector_confidence BETWEEN 0 AND 1),
  match_confidence double precision CHECK (match_confidence BETWEEN 0 AND 1),
  review_status text NOT NULL DEFAULT 'confirmed' CHECK (review_status IN ('confirmed', 'needs-review')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, place_id),
  UNIQUE (id, place_id, species),
  UNIQUE (id, place_id, animal_id),
  FOREIGN KEY (animal_id, place_id, species) REFERENCES animals(id, place_id, species) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pending_sighting_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id text NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  species text NOT NULL CHECK (species IN ('cat', 'dog')),
  detector_confidence double precision NOT NULL CHECK (detector_confidence BETWEEN 0 AND 1),
  detection_box jsonb NOT NULL,
  model_version text NOT NULL,
  embedding vector(576) NOT NULL,
  quality_score double precision NOT NULL CHECK (quality_score BETWEEN 0 AND 1),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS animal_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id text NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  animal_id text NOT NULL,
  sighting_id text,
  model_version text NOT NULL,
  embedding vector(576) NOT NULL,
  quality_score double precision NOT NULL CHECK (quality_score BETWEEN 0 AND 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (animal_id, place_id) REFERENCES animals(id, place_id) ON DELETE CASCADE,
  FOREIGN KEY (sighting_id, place_id, animal_id) REFERENCES sightings(id, place_id, animal_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS match_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id text NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  sighting_id text NOT NULL,
  candidate_animal_id text NOT NULL,
  species text NOT NULL CHECK (species IN ('cat', 'dog')),
  score double precision NOT NULL CHECK (score BETWEEN 0 AND 1),
  status text NOT NULL CHECK (status IN ('suggested', 'confirmed', 'rejected', 'unknown')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (sighting_id, place_id, species) REFERENCES sightings(id, place_id, species) ON DELETE CASCADE,
  FOREIGN KEY (candidate_animal_id, place_id, species) REFERENCES animals(id, place_id, species) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS animals_place_id_idx ON animals(place_id);
CREATE INDEX IF NOT EXISTS sightings_place_id_taken_at_idx ON sightings(place_id, taken_at DESC);
CREATE INDEX IF NOT EXISTS animal_embeddings_place_animal_idx ON animal_embeddings(place_id, animal_id);
