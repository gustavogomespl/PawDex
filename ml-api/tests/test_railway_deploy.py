import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
ML_API_ROOT = Path(__file__).resolve().parents[1]


def test_ml_api_entrypoint_uses_railway_port_with_local_default():
    entrypoint = (ML_API_ROOT / "entrypoint.sh").read_text()

    assert '${PORT:-8000}' in entrypoint
    assert "uvicorn app.main:app" in entrypoint
    # Dual-stack bind: Railway private networking is IPv6, the platform healthcheck
    # is IPv4. Empty --host binds both on Linux; 0.0.0.0 is IPv4-only.
    assert '--host ""' in entrypoint
    assert "--host 0.0.0.0" not in entrypoint


def test_root_railway_config_uses_web_dockerfile():
    config = json.loads((ROOT / "railway.json").read_text())

    assert config["build"]["builder"] == "DOCKERFILE"
    assert config["build"]["dockerfilePath"] == "Dockerfile"
    assert config["deploy"]["healthcheckPath"] == "/signin"


def test_ml_api_railway_config_uses_python_dockerfile():
    config = json.loads((ML_API_ROOT / "railway.json").read_text())

    assert config["build"]["builder"] == "DOCKERFILE"
    assert config["build"]["dockerfilePath"] == "Dockerfile"
    assert config["deploy"]["healthcheckPath"] == "/health"
