from .config import DB_FILE
from .connection import ensure_db_directory, get_connection
from .schema import create_all_tables


def initialize_database() -> None:
    """
    Initialize SQLite file and create base tables.
    """
    ensure_db_directory()
    conn = get_connection()
    create_all_tables(conn)
    conn.close()
    print(f"Database initialized at: {DB_FILE}")


if __name__ == "__main__":
    initialize_database()
