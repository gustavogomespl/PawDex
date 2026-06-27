INSERT INTO places (id, name, type, privacy_level, album_total_slots)
VALUES
  ('place-office-centro', 'Escritorio Centro', 'office', 'invite-only', 12)
ON CONFLICT (id) DO NOTHING;

INSERT INTO animals (
  id,
  place_id,
  species,
  display_name,
  status,
  description,
  color_tags,
  rarity_label,
  primary_photo_url,
  first_seen_at,
  last_seen_at
)
VALUES
  (
    'animal-mingau',
    'place-office-centro',
    'cat',
    'Mingau',
    'community',
    'Gato claro que costuma aparecer perto da recepcao.',
    ARRAY['branco', 'creme'],
    'Comum',
    'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=800&q=80',
    '2026-05-02T12:00:00.000Z',
    '2026-06-24T13:20:00.000Z'
  ),
  (
    'animal-caramelo',
    'place-office-centro',
    'dog',
    'Caramelo',
    'has-owner',
    'Cachorro simpatico visto no jardim lateral.',
    ARRAY['caramelo'],
    'Ocasional',
    'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=800&q=80',
    '2026-05-09T14:10:00.000Z',
    '2026-06-21T11:05:00.000Z'
  ),
  (
    'animal-pretinha',
    'place-office-centro',
    'cat',
    'Pretinha',
    'unknown',
    'Gata escura e discreta, geralmente vista no estacionamento.',
    ARRAY['preto'],
    'Timida',
    'https://images.unsplash.com/photo-1573865526739-10659fec78a5?auto=format&fit=crop&w=800&q=80',
    '2026-05-17T09:30:00.000Z',
    '2026-06-26T18:25:00.000Z'
  ),
  (
    'animal-thor',
    'place-office-centro',
    'dog',
    'Thor',
    'has-owner',
    'Visitante de pequeno porte que aparece com um colaborador.',
    ARRAY['marrom', 'branco'],
    'Visitante',
    'https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=800&q=80',
    '2026-06-03T16:15:00.000Z',
    '2026-06-25T15:00:00.000Z'
  ),
  (
    'animal-sombra',
    'place-office-centro',
    'cat',
    'Sombra',
    'community',
    'Gato cinza que circula perto do bicicletario.',
    ARRAY['cinza'],
    'Raro',
    'https://images.unsplash.com/photo-1495360010541-f48722b34f7d?auto=format&fit=crop&w=800&q=80',
    '2026-06-01T10:00:00.000Z',
    '2026-06-12T10:45:00.000Z'
  ),
  (
    'animal-luna',
    'place-office-centro',
    'cat',
    'Luna',
    'unknown',
    'Gata rajada que aparece perto das plantas.',
    ARRAY['rajado', 'dourado'],
    'Ocasional',
    'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=800&q=80',
    '2026-05-27T12:30:00.000Z',
    '2026-06-18T12:40:00.000Z'
  ),
  (
    'animal-bento',
    'place-office-centro',
    'dog',
    'Bento',
    'has-owner',
    'Cachorro pequeno visto em dias de visita pet-friendly.',
    ARRAY['preto', 'branco'],
    'Lenda local',
    'https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=800&q=80',
    '2026-06-06T10:20:00.000Z',
    '2026-06-06T10:20:00.000Z'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO sightings (
  id,
  place_id,
  animal_id,
  photo_url,
  species,
  zone_label,
  taken_at,
  detector_confidence,
  match_confidence,
  review_status
)
VALUES
  (
    'sighting-mingau-001',
    'place-office-centro',
    'animal-mingau',
    'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=800&q=80',
    'cat',
    'Recepcao',
    '2026-06-24T13:20:00.000Z',
    0.87,
    0.88,
    'confirmed'
  ),
  (
    'sighting-caramelo-001',
    'place-office-centro',
    'animal-caramelo',
    'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=800&q=80',
    'dog',
    'Jardim lateral',
    '2026-06-21T11:05:00.000Z',
    0.86,
    0.82,
    'confirmed'
  ),
  (
    'sighting-thor-002',
    'place-office-centro',
    'animal-thor',
    'https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=800&q=80',
    'dog',
    'Andar 3',
    '2026-06-25T15:00:00.000Z',
    0.8,
    0.75,
    'confirmed'
  ),
  (
    'sighting-pretinha-003',
    'place-office-centro',
    'animal-pretinha',
    'https://images.unsplash.com/photo-1573865526739-10659fec78a5?auto=format&fit=crop&w=800&q=80',
    'cat',
    'Estacionamento',
    '2026-06-26T18:25:00.000Z',
    0.84,
    0.79,
    'confirmed'
  )
ON CONFLICT (id) DO NOTHING;

WITH seed_embeddings (
  place_id,
  animal_id,
  sighting_id,
  model_version,
  basis_index,
  quality_score
) AS (
  VALUES
    (
      'place-office-centro',
      'animal-mingau',
      'sighting-mingau-001',
      'torchvision-mobilenet-v3-small-imagenet1k-v1',
      1,
      0.82
    ),
    (
      'place-office-centro',
      'animal-caramelo',
      'sighting-caramelo-001',
      'torchvision-mobilenet-v3-small-imagenet1k-v1',
      2,
      0.8
    ),
    (
      'place-office-centro',
      'animal-pretinha',
      'sighting-pretinha-003',
      'torchvision-mobilenet-v3-small-imagenet1k-v1',
      3,
      0.79
    ),
    (
      'place-office-centro',
      'animal-luna',
      NULL,
      'torchvision-mobilenet-v3-small-imagenet1k-v1',
      4,
      0.74
    ),
    (
      'place-office-centro',
      'animal-sombra',
      NULL,
      'torchvision-mobilenet-v3-small-imagenet1k-v1',
      5,
      0.71
    ),
    (
      'place-office-centro',
      'animal-thor',
      'sighting-thor-002',
      'torchvision-mobilenet-v3-small-imagenet1k-v1',
      6,
      0.78
    ),
    (
      'place-office-centro',
      'animal-bento',
      NULL,
      'torchvision-mobilenet-v3-small-imagenet1k-v1',
      7,
      0.7
    )
),
seed_vectors AS (
  SELECT
    seed_embeddings.place_id,
    seed_embeddings.animal_id,
    seed_embeddings.sighting_id,
    seed_embeddings.model_version,
    seed_embeddings.quality_score,
    (
      '[' ||
      string_agg(
        CASE
          WHEN dimension = seed_embeddings.basis_index THEN '1'
          ELSE '0'
        END,
        ','
        ORDER BY dimension
      ) ||
      ']'
    )::vector(576) AS embedding
  FROM seed_embeddings
  CROSS JOIN generate_series(1, 576) AS dimension
  GROUP BY
    seed_embeddings.place_id,
    seed_embeddings.animal_id,
    seed_embeddings.sighting_id,
    seed_embeddings.model_version,
    seed_embeddings.quality_score
)
INSERT INTO animal_embeddings (
  place_id,
  animal_id,
  sighting_id,
  model_version,
  embedding,
  quality_score
)
SELECT
  place_id,
  animal_id,
  sighting_id,
  model_version,
  embedding,
  quality_score
FROM seed_vectors
WHERE NOT EXISTS (
  SELECT 1
  FROM animal_embeddings existing
  WHERE existing.place_id = seed_vectors.place_id
    AND existing.animal_id = seed_vectors.animal_id
    AND existing.sighting_id IS NOT DISTINCT FROM seed_vectors.sighting_id
    AND existing.model_version = seed_vectors.model_version
);
