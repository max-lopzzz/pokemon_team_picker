import Database from "better-sqlite3";
import path from "node:path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS roster_pokemon (
  id INTEGER PRIMARY KEY,
  game TEXT NOT NULL,
  species TEXT NOT NULL,
  level INTEGER NOT NULL,
  nature TEXT NOT NULL,
  ability TEXT NOT NULL,
  iv_hp INTEGER NOT NULL,
  iv_atk INTEGER NOT NULL,
  iv_def INTEGER NOT NULL,
  iv_spa INTEGER NOT NULL,
  iv_spd INTEGER NOT NULL,
  iv_spe INTEGER NOT NULL,
  ev_hp INTEGER NOT NULL,
  ev_atk INTEGER NOT NULL,
  ev_def INTEGER NOT NULL,
  ev_spa INTEGER NOT NULL,
  ev_spd INTEGER NOT NULL,
  ev_spe INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS roster_pokemon_moves (
  id INTEGER PRIMARY KEY,
  roster_pokemon_id INTEGER NOT NULL REFERENCES roster_pokemon(id),
  slot INTEGER NOT NULL,
  move_name TEXT NOT NULL
);
`;

let defaultDb: Database.Database | null = null;

export function getRosterDb(dbPath?: string): Database.Database {
  if (dbPath) {
    const db = new Database(dbPath);
    db.exec(SCHEMA);
    return db;
  }
  if (!defaultDb) {
    const resolvedPath = path.join(process.cwd(), "..", "roster.db");
    defaultDb = new Database(resolvedPath);
    defaultDb.exec(SCHEMA);
  }
  return defaultDb;
}
