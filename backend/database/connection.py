import sqlite3
from contextlib import contextmanager
from pathlib import Path

from .config import DB_FILE

SQLITE_TIMEOUT_SECONDS = 30
SQLITE_BUSY_TIMEOUT_MS = SQLITE_TIMEOUT_SECONDS * 1000


def ensure_db_directory() -> None:
    """Create database directory if it does not exist."""
    Path(DB_FILE).parent.mkdir(parents=True, exist_ok=True)


def _configure_connection(conn: sqlite3.Connection) -> sqlite3.Connection:
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute(f"PRAGMA busy_timeout = {SQLITE_BUSY_TIMEOUT_MS}")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA temp_store = MEMORY")
    return conn


def get_connection() -> sqlite3.Connection:
    """
    Create and return a SQLite connection.
    Row factory is set to sqlite3.Row for dict-like access.
    """
    ensure_db_directory()
    conn = sqlite3.connect(DB_FILE, timeout=SQLITE_TIMEOUT_SECONDS)
    return _configure_connection(conn)


@contextmanager
def db_cursor():
    """
    Context manager to safely handle cursor lifecycle and commit/rollback.
    """
    conn = get_connection()
    cursor = conn.cursor()
    try:
        yield cursor
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()