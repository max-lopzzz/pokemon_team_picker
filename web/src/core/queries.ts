import { getDb } from "./db";
import type {
  Generation,
  Game,
  Gym,
  Encounter,
  EncounterPokemon,
  EncounterTeam,
} from "./types";

export function listGenerations(): Generation[] {
  return getDb()
    .prepare("SELECT id, number FROM generations ORDER BY number")
    .all() as Generation[];
}

export function listGames(generationNumber: number): Game[] {
  return getDb()
    .prepare(
      `SELECT g.id, g.name, g.generation_id AS generationId
       FROM games g
       JOIN generations gen ON g.generation_id = gen.id
       WHERE gen.number = ?
       ORDER BY g.name`
    )
    .all(generationNumber) as Game[];
}

export function listGyms(gameName: string): Gym[] {
  return getDb()
    .prepare(
      `SELECT gy.id, gy.name, gy.game_id AS gameId
       FROM gyms gy
       JOIN games g ON gy.game_id = g.id
       WHERE g.name = ?
       ORDER BY gy.id`
    )
    .all(gameName) as Gym[];
}

export function listEncounters(gameName: string, gymName: string): Encounter[] {
  return getDb()
    .prepare(
      `SELECT e.id, e.game_id AS gameId, e.gym_id AS gymId, e.leader_id AS leaderId,
              l.name AS leaderName, e.variant AS variant
       FROM encounters e
       JOIN games g ON e.game_id = g.id
       JOIN gyms gy ON e.gym_id = gy.id
       JOIN gym_leaders l ON e.leader_id = l.id
       WHERE g.name = ? AND gy.name = ?
       ORDER BY e.id`
    )
    .all(gameName, gymName) as Encounter[];
}

export function getEncounterTeam(encounterId: number): EncounterTeam | null {
  const db = getDb();

  const encounter = db
    .prepare(
      `SELECT e.id, e.game_id AS gameId, e.gym_id AS gymId, e.leader_id AS leaderId,
              l.name AS leaderName, e.variant AS variant
       FROM encounters e
       JOIN gym_leaders l ON e.leader_id = l.id
       WHERE e.id = ?`
    )
    .get(encounterId) as Encounter | undefined;

  if (!encounter) return null;

  const pokemonRows = db
    .prepare(
      `SELECT id, position, species, level, gender, held_item AS heldItem, dynamax
       FROM encounter_pokemon
       WHERE encounter_id = ?
       ORDER BY position`
    )
    .all(encounterId) as Omit<EncounterPokemon, "moves">[];

  const moveStmt = db.prepare(
    `SELECT move_name FROM encounter_pokemon_moves
     WHERE encounter_pokemon_id = ? ORDER BY slot`
  );

  const pokemon: EncounterPokemon[] = pokemonRows.map((p) => ({
    ...p,
    moves: (moveStmt.all(p.id) as { move_name: string }[]).map(
      (m) => m.move_name
    ),
  }));

  return { encounter, pokemon };
}

export function getGameGeneration(gameName: string): number | null {
  const row = getDb()
    .prepare(
      `SELECT gen.number AS number
       FROM games g
       JOIN generations gen ON g.generation_id = gen.id
       WHERE g.name = ?`
    )
    .get(gameName) as { number: number } | undefined;
  return row ? row.number : null;
}
