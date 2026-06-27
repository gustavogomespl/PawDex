CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS places (
  id text PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL,
  privacy_level text NOT NULL,
  album_total_slots integer NOT NULL DEFAULT 12,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS animals (
  id text PRIMARY KEY,
  place_id text NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  species text NOT NULL CHECK (species IN ('cat', 'dog')),
  display_name text NOT NULL,
  status text NOT NULL,
  description text NOT NULL DEFAULT '',
  color_tags text[] NOT NULL DEFAULT '{}',
  rarity_label text NOT NULL DEFAULT 'Ocasional',
  primary_photo_url text NOT NULL,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sightings (
  id text PRIMARY KEY,
  place_id text NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  animal_id text NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  species text NOT NULL CHECK (species IN ('cat', 'dog')),
  zone_label text NOT NULL DEFAULT 'Area comum',
  taken_at timestamptz NOT NULL,
  detector_confidence double precision,
  match_confidence double precision,
  review_status text NOT NULL DEFAULT 'confirmed',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pending_sighting_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id text NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  species text NOT NULL CHECK (species IN ('cat', 'dog')),
  detector_confidence double precision NOT NULL,
  detection_box jsonb NOT NULL,
  model_version text NOT NULL,
  embedding vector(576) NOT NULL,
  quality_score double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS animal_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id text NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  animal_id text NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  sighting_id text REFERENCES sightings(id) ON DELETE CASCADE,
  model_version text NOT NULL,
  embedding vector(576) NOT NULL,
  quality_score double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS match_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id text NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  sighting_id text NOT NULL REFERENCES sightings(id) ON DELETE CASCADE,
  candidate_animal_id text NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  score double precision NOT NULL,
  status text NOT NULL CHECK (status IN ('suggested', 'confirmed', 'rejected', 'unknown')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS animals_place_id_idx ON animals(place_id);
CREATE INDEX IF NOT EXISTS sightings_place_id_taken_at_idx ON sightings(place_id, taken_at DESC);
CREATE INDEX IF NOT EXISTS animal_embeddings_place_species_idx ON animal_embeddings(place_id, animal_id);
