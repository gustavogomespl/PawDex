import pytest

from app.storage import InMemoryObjectStorage


def test_put_then_get_roundtrips_data_and_content_type():
    storage = InMemoryObjectStorage()
    storage.put("crops/abc.jpg", b"bytes", "image/jpeg")

    data, content_type = storage.get("crops/abc.jpg")

    assert data == b"bytes"
    assert content_type == "image/jpeg"


def test_get_missing_key_raises():
    storage = InMemoryObjectStorage()
    with pytest.raises(KeyError):
        storage.get("crops/missing.jpg")
