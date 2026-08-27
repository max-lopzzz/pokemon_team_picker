import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { addRosterPokemon, listRoster, deleteRosterPokemon } from "./rosterQueries";

describe("roster CRUD", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "roster-db-"));
    dbPath = path.join(tmpDir, "roster.db");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const sample = {
    game: "Red",
    species: "Geodude",
    level: 12,
    nature: "Adamant",
    ability: "Sturdy",
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 0, spe: 0 },
    moves: ["Tackle", "Defense Curl"],
  };

  it("adds a Pokémon and lists it back with its moves", () => {
    const id = addRosterPokemon(sample, { dbPath });
    expect(id).toBeGreaterThan(0);

    const roster = listRoster("Red", { dbPath });
    expect(roster).toHaveLength(1);
    expect(roster[0]).toMatchObject({
      id,
      game: "Red",
      species: "Geodude",
      level: 12,
      nature: "Adamant",
      ability: "Sturdy",
      ivs: sample.ivs,
      evs: sample.evs,
      moves: ["Tackle", "Defense Curl"],
    });
  });

  it("scopes listRoster to the requested game", () => {
    addRosterPokemon(sample, { dbPath });
    addRosterPokemon({ ...sample, game: "Blue", species: "Onix" }, { dbPath });

    expect(listRoster("Red", { dbPath })).toHaveLength(1);
    expect(listRoster("Blue", { dbPath })).toHaveLength(1);
    expect(listRoster("Yellow", { dbPath })).toHaveLength(0);
  });

  it("deletes a Pokémon and its moves", () => {
    const id = addRosterPokemon(sample, { dbPath });
    deleteRosterPokemon(id, { dbPath });
    expect(listRoster("Red", { dbPath })).toHaveLength(0);
  });

  it("deleting an unknown id is a no-op", () => {
    addRosterPokemon(sample, { dbPath });
    expect(() => deleteRosterPokemon(999999, { dbPath })).not.toThrow();
    expect(listRoster("Red", { dbPath })).toHaveLength(1);
  });
});
