"""Migrate gym_leaders.csv into a normalized SQLite database (gym_leaders.db).

The CSV is the source of truth; this script is rerunnable and rebuilds the
database from scratch each time.
"""
import csv
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "gym_leaders.csv"
DB_PATH = ROOT / "gym_leaders.db"

SCHEMA = """
CREATE TABLE generations (
    id INTEGER PRIMARY KEY,
    number INTEGER NOT NULL UNIQUE
);

CREATE TABLE games (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    generation_id INTEGER NOT NULL REFERENCES generations(id)
);

CREATE TABLE gyms (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    game_id INTEGER NOT NULL REFERENCES games(id),
    UNIQUE(name, game_id)
);

CREATE TABLE gym_leaders (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE encounters (
    id INTEGER PRIMARY KEY,
    game_id INTEGER NOT NULL REFERENCES games(id),
    gym_id INTEGER NOT NULL REFERENCES gyms(id),
    leader_id INTEGER NOT NULL REFERENCES gym_leaders(id),
    variant TEXT,
    UNIQUE(game_id, gym_id, leader_id, variant)
);

CREATE TABLE encounter_pokemon (
    id INTEGER PRIMARY KEY,
    encounter_id INTEGER NOT NULL REFERENCES encounters(id),
    position INTEGER NOT NULL,
    species TEXT NOT NULL,
    level INTEGER,
    gender TEXT,
    held_item TEXT,
    dynamax TEXT
);

CREATE TABLE encounter_pokemon_moves (
    id INTEGER PRIMARY KEY,
    encounter_pokemon_id INTEGER NOT NULL REFERENCES encounter_pokemon(id),
    slot INTEGER NOT NULL,
    move_name TEXT NOT NULL
);

CREATE INDEX idx_encounters_leader ON encounters(leader_id);
CREATE INDEX idx_encounters_game ON encounters(game_id);
CREATE INDEX idx_encounter_pokemon_encounter ON encounter_pokemon(encounter_id);
CREATE INDEX idx_encounter_pokemon_moves_ep ON encounter_pokemon_moves(encounter_pokemon_id);
"""

LEADER_VARIANT_RE = re.compile(r"^([^(]+?)((?: \([^)]*\))*)$")


def split_leader(raw_leader):
    """Split e.g. 'Blue (starter: Charmander) (rematch)' into name + variant."""
    match = LEADER_VARIANT_RE.match(raw_leader.strip())
    name = match.group(1).strip()
    variant = match.group(2).strip() or None
    if variant:
        # Strip the outer parens/spacing so 'variant' is plain text,
        # e.g. '(starter: Charmander) (rematch)' -> 'starter: Charmander; rematch'
        parts = re.findall(r"\(([^)]*)\)", variant)
        variant = "; ".join(parts)
    return name, variant


def get_or_create(cursor, table, unique_cols, row):
    placeholders = " AND ".join(f"{col} = ?" for col in unique_cols)
    cursor.execute(
        f"SELECT id FROM {table} WHERE {placeholders}",
        tuple(row[col] for col in unique_cols),
    )
    existing = cursor.fetchone()
    if existing:
        return existing[0]
    cols = list(row.keys())
    cursor.execute(
        f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join('?' for _ in cols)})",
        tuple(row.values()),
    )
    return cursor.lastrowid


def migrate():
    DB_PATH.unlink(missing_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)
    cursor = conn.cursor()

    with open(CSV_PATH, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            gen_id = get_or_create(
                cursor, "generations", ["number"], {"number": int(row["Generation"])}
            )
            game_id = get_or_create(
                cursor,
                "games",
                ["name"],
                {"name": row["Game"], "generation_id": gen_id},
            )
            gym_id = get_or_create(
                cursor,
                "gyms",
                ["name", "game_id"],
                {"name": row["Gym name"], "game_id": game_id},
            )
            leader_name, variant = split_leader(row["Gym leader"])
            leader_id = get_or_create(
                cursor, "gym_leaders", ["name"], {"name": leader_name}
            )

            cursor.execute(
                """SELECT id FROM encounters
                   WHERE game_id = ? AND gym_id = ? AND leader_id = ?
                   AND variant IS ?""",
                (game_id, gym_id, leader_id, variant),
            )
            existing = cursor.fetchone()
            if existing:
                encounter_id = existing[0]
            else:
                cursor.execute(
                    """INSERT INTO encounters (game_id, gym_id, leader_id, variant)
                       VALUES (?, ?, ?, ?)""",
                    (game_id, gym_id, leader_id, variant),
                )
                encounter_id = cursor.lastrowid

            cursor.execute(
                "SELECT COALESCE(MAX(position), 0) FROM encounter_pokemon WHERE encounter_id = ?",
                (encounter_id,),
            )
            position = cursor.fetchone()[0] + 1

            cursor.execute(
                """INSERT INTO encounter_pokemon
                   (encounter_id, position, species, level, gender, held_item, dynamax)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    encounter_id,
                    position,
                    row["Pokémon"].strip(),
                    int(row["Level"]) if row["Level"].strip() else None,
                    row["Gender"].strip() or None,
                    row["Held Item"].strip() or None,
                    row["Dynamax"].strip() or None,
                ),
            )
            encounter_pokemon_id = cursor.lastrowid

            for slot, key in enumerate(["Move 1", "Move 2", "Move 3", "Move 4"], start=1):
                move_name = row[key].strip()
                if move_name:
                    cursor.execute(
                        """INSERT INTO encounter_pokemon_moves
                           (encounter_pokemon_id, slot, move_name)
                           VALUES (?, ?, ?)""",
                        (encounter_pokemon_id, slot, move_name),
                    )

    conn.commit()

    counts = {}
    for table in ["generations", "games", "gyms", "gym_leaders", "encounters", "encounter_pokemon", "encounter_pokemon_moves"]:
        counts[table] = cursor.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    conn.close()
    return counts


if __name__ == "__main__":
    counts = migrate()
    print(f"Migrated {CSV_PATH.name} -> {DB_PATH.name}")
    for table, count in counts.items():
        print(f"  {table}: {count}")
