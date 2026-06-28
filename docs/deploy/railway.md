# Railway deploy

This repo still runs locally with `docker compose up --build`. Railway deploy is
configured as separate services, not by running `compose.yaml` in production.

## Services

Create these services from the same GitHub repo:

1. `web`
   - Root directory: repository root.
   - Config file: `railway.json`.
   - Public domain: enabled.

2. `api`
   - Root directory: `ml-api`.
   - Config file: `ml-api/railway.json`.
   - Public domain: disabled. It is called only through Railway private
     networking.

3. Postgres with pgvector
   - Use a Railway pgvector template or a Postgres image where
     `CREATE EXTENSION vector` works. The default Postgres template may not ship
     pgvector.

4. Railway Bucket or another S3-compatible bucket
   - Used only by the `api` service for cropped pet photos.

## `web` variables

Set these on the `web` service:

```env
PORT=3000
ML_API_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}
AUTH_SECRET=<generate-a-long-random-secret>
PAWDEX_INTERNAL_TOKEN=<same-random-token-as-api>
PAWDEX_ENABLE_DEV_AUTH=true
```

`PAWDEX_ENABLE_DEV_AUTH=true` is acceptable for a private demo while the app has
only the development e-mail login. Album invite codes are entered after the user
is logged in, from "Meus albuns". Before opening this publicly, add a real auth
provider and set dev auth to `false`.

## `api` variables

Set these on the `api` service:

```env
PORT=8000
DATABASE_URL=${{Postgres.DATABASE_URL}}
PAWDEX_INTERNAL_TOKEN=<same-random-token-as-web>
PAWDEX_ALLOWED_ORIGINS=https://<your-web-public-domain>
PAWDEX_YOLO_MODEL=yolo11n.pt
PAWDEX_YOLO_CONFIDENCE=0.35
PAWDEX_RATE_LIMIT_PER_MIN=60
```

For Railway Buckets, add the bucket credentials to the `api` service. The app
accepts Railway's default names:

```env
AWS_ENDPOINT_URL=https://storage.railway.app
AWS_ACCESS_KEY_ID=<bucket-access-key>
AWS_SECRET_ACCESS_KEY=<bucket-secret-key>
AWS_S3_BUCKET_NAME=<bucket-name>
```

For another S3-compatible provider, you can use the PawDex names instead:

```env
PAWDEX_S3_ENDPOINT=<host-or-https-endpoint>
PAWDEX_S3_ACCESS_KEY=<access-key>
PAWDEX_S3_SECRET_KEY=<secret-key>
PAWDEX_S3_BUCKET=<bucket-name>
PAWDEX_S3_SECURE=true
```

## Deploy order

1. Create Postgres with pgvector and the bucket.
2. Deploy `api`.
3. Check `api` health from Railway logs or by temporarily enabling a public
   domain and opening `/health`.
4. Deploy `web`.
5. Open the `web` public domain, sign in, create a place, and register a
   sighting.

## Local development

No Railway variables are needed locally. Keep using:

```bash
docker compose up --build
```

The local stack still uses Compose service names (`db`, `minio`, `ml-api`) and
the defaults in `compose.yaml`.
