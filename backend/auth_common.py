import hashlib

from flask import request

from database import get_connection


def hash_password(raw_password: str) -> str:
    return hashlib.sha256(raw_password.encode("utf-8")).hexdigest()


def bearer_token() -> str:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return ""
    return auth[7:].strip()


def resolve_user_id_from_token() -> int | None:
    token = bearer_token()
    if not token:
        return None
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT user_id FROM auth_tokens WHERE token = ?", (token,))
        row = cur.fetchone()
        return int(row["user_id"]) if row else None
    finally:
        cur.close()
        conn.close()
