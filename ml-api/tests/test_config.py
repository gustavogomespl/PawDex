from app.config import load_settings


def test_load_settings_accepts_railway_bucket_variables(monkeypatch):
    monkeypatch.delenv("PAWDEX_S3_ENDPOINT", raising=False)
    monkeypatch.delenv("PAWDEX_S3_ACCESS_KEY", raising=False)
    monkeypatch.delenv("PAWDEX_S3_SECRET_KEY", raising=False)
    monkeypatch.delenv("PAWDEX_S3_BUCKET", raising=False)
    monkeypatch.delenv("PAWDEX_S3_SECURE", raising=False)
    monkeypatch.setenv("AWS_ENDPOINT_URL", "https://storage.railway.app")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "railway-key")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "railway-secret")
    monkeypatch.setenv("AWS_S3_BUCKET_NAME", "pawdex-prod")

    settings = load_settings()

    assert settings.s3_endpoint == "https://storage.railway.app"
    assert settings.s3_access_key == "railway-key"
    assert settings.s3_secret_key == "railway-secret"
    assert settings.s3_bucket == "pawdex-prod"
    assert settings.s3_secure is True


def test_pawdex_s3_variables_override_railway_bucket_variables(monkeypatch):
    monkeypatch.setenv("AWS_ENDPOINT_URL", "https://storage.railway.app")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "railway-key")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "railway-secret")
    monkeypatch.setenv("AWS_S3_BUCKET_NAME", "railway-bucket")
    monkeypatch.setenv("PAWDEX_S3_ENDPOINT", "minio:9000")
    monkeypatch.setenv("PAWDEX_S3_ACCESS_KEY", "local-key")
    monkeypatch.setenv("PAWDEX_S3_SECRET_KEY", "local-secret")
    monkeypatch.setenv("PAWDEX_S3_BUCKET", "local-bucket")
    monkeypatch.setenv("PAWDEX_S3_SECURE", "false")

    settings = load_settings()

    assert settings.s3_endpoint == "minio:9000"
    assert settings.s3_access_key == "local-key"
    assert settings.s3_secret_key == "local-secret"
    assert settings.s3_bucket == "local-bucket"
    assert settings.s3_secure is False
