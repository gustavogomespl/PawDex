import pytest

from app.storage import InMemoryObjectStorage, is_storage_key


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


def test_delete_removes_object_and_is_idempotent():
    storage = InMemoryObjectStorage()
    storage.put("crops/x.jpg", b"x", "image/jpeg")
    storage.delete("crops/x.jpg")
    with pytest.raises(KeyError):
        storage.get("crops/x.jpg")
    storage.delete("crops/x.jpg")  # missing key is a no-op


def test_is_storage_key_distinguishes_keys_from_urls():
    assert is_storage_key("crops/x.jpg") is True
    assert is_storage_key("https://example.com/a.jpg") is False
    assert is_storage_key("http://example.com/a.jpg") is False
    assert is_storage_key("data:image/png;base64,xxx") is False
    assert is_storage_key("/local.png") is False
    assert is_storage_key(None) is False
    assert is_storage_key("") is False
