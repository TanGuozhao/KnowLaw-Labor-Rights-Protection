from database import DB_FILE, initialize_database


def main() -> None:
    initialize_database()
    print("Backend bootstrap complete.")
    print(f"Current SQLite database file: {DB_FILE}")


if __name__ == "__main__":
    main()
