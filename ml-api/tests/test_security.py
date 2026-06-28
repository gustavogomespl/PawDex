from app.security import hash_password, verify_password


def test_password_hash_verifies_original_password():
    password_hash = hash_password("senha-segura")

    assert password_hash != "senha-segura"
    assert verify_password("senha-segura", password_hash) is True
    assert verify_password("senha-errada", password_hash) is False


def test_password_hash_uses_unique_salts():
    assert hash_password("senha-segura") != hash_password("senha-segura")
