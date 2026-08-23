import { getRosterDb } from "./rosterDb";
import type { RosterPokemon, NewRosterPokemon } from "./types";

interface Options {
  dbPath?: string;
}

interface RosterRow {
  id: number;
  game: string;
  species: string;
  level: number;
  nature: string;
  ability: string;
  iv_hp: number;
  iv_atk: number;
  iv_def: number;
  iv_spa: number;
  iv_spd: number;
  iv_spe: number;
  ev_hp: number;
  ev_atk: number;
  ev_def: number;
  ev_spa: number;
  ev_spd: number;
  ev_spe: number;
}

export function addRosterPokemon(
  pokemon: NewRosterPokemon,
  options: Options = {}
): number {
  const db = getRosterDb(options.dbPath);
  const insert = db.prepare(`
    INSERT INTO roster_pokemon
      (game, species, level, nature, ability,
       iv_hp, iv_atk, iv_def, iv_spa, iv_spd, iv_spe,
       ev_hp, ev_atk, ev_def, ev_spa, ev_spd, ev_spe)
    VALUES (@game, @species, @level, @nature, @ability,
            @iv_hp, @iv_atk, @iv_def, @iv_spa, @iv_spd, @iv_spe,
            @ev_hp, @ev_atk, @ev_def, @ev_spa, @ev_spd, @ev_spe)
  `);
  const result = insert.run({
    game: pokemon.game,
    species: pokemon.species,
    level: pokemon.level,
    nature: pokemon.nature,
    ability: pokemon.ability,
    iv_hp: pokemon.ivs.hp,
    iv_atk: pokemon.ivs.atk,
    iv_def: pokemon.ivs.def,
    iv_spa: pokemon.ivs.spa,
    iv_spd: pokemon.ivs.spd,
    iv_spe: pokemon.ivs.spe,
    ev_hp: pokemon.evs.hp,
    ev_atk: pokemon.evs.atk,
    ev_def: pokemon.evs.def,
    ev_spa: pokemon.evs.spa,
    ev_spd: pokemon.evs.spd,
    ev_spe: pokemon.evs.spe,
  });
  const id = result.lastInsertRowid as number;

  const insertMove = db.prepare(
    `INSERT INTO roster_pokemon_moves (roster_pokemon_id, slot, move_name) VALUES (?, ?, ?)`
  );
  pokemon.moves.forEach((move, index) => {
    insertMove.run(id, index + 1, move);
  });

  return id;
}

export function listRoster(game: string, options: Options = {}): RosterPokemon[] {
  const db = getRosterDb(options.dbPath);
  const rows = db
    .prepare(`SELECT * FROM roster_pokemon WHERE game = ? ORDER BY id`)
    .all(game) as RosterRow[];

  const moveStmt = db.prepare(
    `SELECT move_name FROM roster_pokemon_moves WHERE roster_pokemon_id = ? ORDER BY slot`
  );

  return rows.map((row) => ({
    id: row.id,
    game: row.game,
    species: row.species,
    level: row.level,
    nature: row.nature,
    ability: row.ability,
    ivs: {
      hp: row.iv_hp,
      atk: row.iv_atk,
      def: row.iv_def,
      spa: row.iv_spa,
      spd: row.iv_spd,
      spe: row.iv_spe,
    },
    evs: {
      hp: row.ev_hp,
      atk: row.ev_atk,
      def: row.ev_def,
      spa: row.ev_spa,
      spd: row.ev_spd,
      spe: row.ev_spe,
    },
    moves: (moveStmt.all(row.id) as { move_name: string }[]).map(
      (m) => m.move_name
    ),
  }));
}

export function deleteRosterPokemon(id: number, options: Options = {}): void {
  const db = getRosterDb(options.dbPath);
  db.prepare(`DELETE FROM roster_pokemon_moves WHERE roster_pokemon_id = ?`).run(id);
  db.prepare(`DELETE FROM roster_pokemon WHERE id = ?`).run(id);
}
