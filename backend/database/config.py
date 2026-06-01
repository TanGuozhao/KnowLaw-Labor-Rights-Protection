from pathlib import Path


# Project root: .../LabelHelp
PROJECT_ROOT = Path(__file__).resolve().parents[2]

# SQLite file location (can be adjusted later if needed)
DB_FILE = PROJECT_ROOT / "backend" / "database" / "labelhelp.db"
