# Phase 2: Roster Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user build a per-game Pokémon roster (species, level, nature, ability, full IVs/EVs, and a moveset picked from PokeAPI's complete learnset) that Phase 4's recommendation engine will later score against a gym leader's team.

**Architecture:** A new writable `roster.db` SQLite database (separate from the read-only `gym_leaders.db`), a framework-free `core/` layer (validation, DB access, PokeAPI learnset lookups, static reference data) each independently unit tested, and a `/[game]/roster` page built from Next.js Server Actions plus one client-side island for the interactive species→abilities/moveset lookup.

**Tech Stack:** Next.js 15 (App Router, Server Actions), React 19, TypeScript, `better-sqlite3` (read-write, `roster.db`), native `fetch` for PokeAPI, Vitest for unit tests. Builds directly on Phase 1's `web/` app.

**Spec:** [docs/superpowers/specs/2026-08-23-phase2-roster-input-design.md](../specs/2026-08-23-phase2-roster-input-design.md)

## Global Constraints

- `roster.db` is a new, separate, read-write SQLite database at the repo root (`../roster.db` from `web/`) — **not** committed to git (add to `.gitignore`), schema created lazily via `CREATE TABLE IF NOT EXISTS`.
- `gym_leaders.db` is never written to by Phase 2 code — it stays read-only reference data.
- Every `core/` module added in this phase (`rosterValidation.ts`, `rosterDb.ts`, `rosterQueries.ts`, `movelearn.ts`, `natures.ts`, `versionGroups.ts`) has zero Next.js/React imports — importable and testable in plain Node.
- Automated tests use real data where practical: `versionGroups.ts` is tested against the real, already-committed `gym_leaders.db`; `rosterDb.ts`/`rosterQueries.ts` are tested against a temporary SQLite file (never the real `roster.db`); `movelearn.ts` is tested with a mocked, dependency-injected `fetch` (never real network calls in automated tests).
- PokeAPI failures degrade gracefully: `movelearn.ts` uses the same timeout + negative-caching + logging pattern Phase 1's `pokeapi.ts` was fixed to use (a 5s `AbortSignal.timeout`, a cached miss-marker so a failed lookup isn't re-fetched forever, and `console.error` logging on failure) — built in from the start this time, not as a follow-up fix.
- Pages and Server Actions are verified manually (`curl` for plain GETs, real browser interaction for form submissions) — no automated UI/integration tests, matching Phase 1's approach.

---

### Task 1: Static reference data — types, natures, version groups

**Files:**
- Modify: `web/src/core/types.ts`
- Create: `web/src/core/natures.ts`
- Test: `web/src/core/natures.test.ts`
- Create: `web/src/core/versionGroups.ts`
- Test: `web/src/core/versionGroups.test.ts`

**Interfaces:**
- Produces: types `StatBlock`, `Nature`, `RosterPokemon`, `NewRosterPokemon`, `LearnableMoves` (in `types.ts`); `NATURES: Nature[]` (25 entries, from `natures.ts`); `GAME_TO_VERSION_GROUP: Record<string, string>` (35 entries, from `versionGroups.ts`).
- Consumes: `listGenerations()`, `listGames()` from `./queries` (Phase 1, for the `versionGroups.test.ts` real-data check).

- [ ] **Step 1: Add new types to `web/src/core/types.ts`**

Append to the existing file (do not remove anything already there):

```ts
export interface StatBlock {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

export interface Nature {
  name: string;
  plus: "atk" | "def" | "spa" | "spd" | "spe" | null;
  minus: "atk" | "def" | "spa" | "spd" | "spe" | null;
}

export interface RosterPokemon {
  id: number;
  game: string;
  species: string;
  level: number;
  nature: string;
  ability: string;
  ivs: StatBlock;
  evs: StatBlock;
  moves: string[];
}

export interface NewRosterPokemon {
  game: string;
  species: string;
  level: number;
  nature: string;
  ability: string;
  ivs: StatBlock;
  evs: StatBlock;
  moves: string[];
}

export interface LearnableMoves {
  levelUp: string[];
  machine: string[];
  tutor: string[];
  egg: string[];
}
```

- [ ] **Step 2: Write the failing test file** — `web/src/core/natures.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { NATURES } from "./natures";

describe("NATURES", () => {
  it("has exactly 25 natures with unique names", () => {
    expect(NATURES).toHaveLength(25);
    const names = new Set(NATURES.map((n) => n.name));
    expect(names.size).toBe(25);
  });

  it("has correct plus/minus stats for known natures", () => {
    const adamant = NATURES.find((n) => n.name === "Adamant");
    expect(adamant).toEqual({ name: "Adamant", plus: "atk", minus: "spa" });

    const hardy = NATURES.find((n) => n.name === "Hardy");
    expect(hardy).toEqual({ name: "Hardy", plus: null, minus: null });

    const timid = NATURES.find((n) => n.name === "Timid");
    expect(timid).toEqual({ name: "Timid", plus: "spe", minus: "atk" });
  });
});
```

- [ ] **Step 3: Run the test and verify it fails**

Run (from `web/`): `npm test`
Expected: FAIL — `Cannot find module './natures'`.

- [ ] **Step 4: Create `web/src/core/natures.ts`**

```ts
import type { Nature } from "./types";

export const NATURES: Nature[] = [
  { name: "Hardy", plus: null, minus: null },
  { name: "Lonely", plus: "atk", minus: "def" },
  { name: "Brave", plus: "atk", minus: "spe" },
  { name: "Adamant", plus: "atk", minus: "spa" },
  { name: "Naughty", plus: "atk", minus: "spd" },
  { name: "Bold", plus: "def", minus: "atk" },
  { name: "Docile", plus: null, minus: null },
  { name: "Relaxed", plus: "def", minus: "spe" },
  { name: "Impish", plus: "def", minus: "spa" },
  { name: "Lax", plus: "def", minus: "spd" },
  { name: "Timid", plus: "spe", minus: "atk" },
  { name: "Hasty", plus: "spe", minus: "def" },
  { name: "Serious", plus: null, minus: null },
  { name: "Jolly", plus: "spe", minus: "spa" },
  { name: "Naive", plus: "spe", minus: "spd" },
  { name: "Modest", plus: "spa", minus: "atk" },
  { name: "Mild", plus: "spa", minus: "def" },
  { name: "Quiet", plus: "spa", minus: "spe" },
  { name: "Bashful", plus: null, minus: null },
  { name: "Rash", plus: "spa", minus: "spd" },
  { name: "Calm", plus: "spd", minus: "atk" },
  { name: "Gentle", plus: "spd", minus: "def" },
  { name: "Sassy", plus: "spd", minus: "spe" },
  { name: "Careful", plus: "spd", minus: "spa" },
  { name: "Quirky", plus: null, minus: null },
];
```

- [ ] **Step 5: Run the test and verify it passes**

Run (from `web/`): `npm test`
Expected: PASS — the 2 new `natures.test.ts` tests pass, plus all prior Phase 1 tests still pass (10/10 + 2 = 12/12).

- [ ] **Step 6: Write the failing test file** — `web/src/core/versionGroups.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { listGenerations, listGames } from "./queries";
import { GAME_TO_VERSION_GROUP } from "./versionGroups";

describe("GAME_TO_VERSION_GROUP", () => {
  it("has an entry for every game in the real gym_leaders.db", () => {
    const generations = listGenerations();
    const allGames = generations.flatMap((gen) =>
      listGames(gen.number).map((g) => g.name)
    );
    expect(allGames.length).toBeGreaterThan(0);
    for (const game of allGames) {
      expect(GAME_TO_VERSION_GROUP[game]).toBeDefined();
    }
  });

  it("maps known games to their correct PokeAPI version group", () => {
    expect(GAME_TO_VERSION_GROUP["Red"]).toBe("red-blue");
    expect(GAME_TO_VERSION_GROUP["Green"]).toBe("red-blue");
    expect(GAME_TO_VERSION_GROUP["Scarlet"]).toBe("scarlet-violet");
    expect(GAME_TO_VERSION_GROUP["Sword"]).toBe("sword-shield");
    expect(GAME_TO_VERSION_GROUP["Brilliant Diamond"]).toBe(
      "brilliant-diamond-shining-pearl"
    );
  });
});
```

- [ ] **Step 7: Run the test and verify it fails**

Run (from `web/`): `npm test`
Expected: FAIL — `Cannot find module './versionGroups'`.

- [ ] **Step 8: Create `web/src/core/versionGroups.ts`**

```ts
export const GAME_TO_VERSION_GROUP: Record<string, string> = {
  Red: "red-blue",
  Blue: "red-blue",
  Green: "red-blue",
  Yellow: "yellow",
  Gold: "gold-silver",
  Silver: "gold-silver",
  Crystal: "crystal",
  Ruby: "ruby-sapphire",
  Sapphire: "ruby-sapphire",
  Emerald: "emerald",
  FireRed: "firered-leafgreen",
  LeafGreen: "firered-leafgreen",
  Diamond: "diamond-pearl",
  Pearl: "diamond-pearl",
  Platinum: "platinum",
  HeartGold: "heartgold-soulsilver",
  SoulSilver: "heartgold-soulsilver",
  Black: "black-white",
  White: "black-white",
  "Black 2": "black-2-white-2",
  "White 2": "black-2-white-2",
  X: "x-y",
  Y: "x-y",
  "Omega Ruby": "omega-ruby-alpha-sapphire",
  "Alpha Sapphire": "omega-ruby-alpha-sapphire",
  Sun: "sun-moon",
  Moon: "sun-moon",
  "Ultra Sun": "ultra-sun-ultra-moon",
  "Ultra Moon": "ultra-sun-ultra-moon",
  Sword: "sword-shield",
  Shield: "sword-shield",
  "Brilliant Diamond": "brilliant-diamond-shining-pearl",
  "Shining Pearl": "brilliant-diamond-shining-pearl",
  Scarlet: "scarlet-violet",
  Violet: "scarlet-violet",
};
```

- [ ] **Step 9: Run the test and verify it passes**

Run (from `web/`): `npm test`
Expected: PASS — all tests pass (12 prior + 2 new `versionGroups.test.ts` = 14/14).

- [ ] **Step 10: Commit**

```bash
git add web/src/core/types.ts web/src/core/natures.ts web/src/core/natures.test.ts web/src/core/versionGroups.ts web/src/core/versionGroups.test.ts
git commit -m "Add roster types, natures list, and game-to-version-group mapping"
```

---

### Task 2: Roster validation

**Files:**
- Test: `web/src/core/rosterValidation.test.ts`
- Create: `web/src/core/rosterValidation.ts`

**Interfaces:**
- Consumes: `StatBlock` type from `./types` (Task 1).
- Produces:
  - `interface ValidationError { field: string; message: string }`
  - `validateLevel(level: number): ValidationError | null`
  - `validateIVs(ivs: StatBlock): ValidationError[]`
  - `validateEVs(evs: StatBlock): ValidationError[]`
  - `validateNature(nature: string, validNatureNames: string[]): ValidationError | null`
  - `validateAbility(ability: string, validAbilities: string[]): ValidationError | null`
  - `validateMoves(moves: string[], learnablePool: string[]): ValidationError[]`

- [ ] **Step 1: Write the failing test file** — `web/src/core/rosterValidation.test.ts`

```ts
import { describe, it, expect } from "vitest";
import {
  validateLevel,
  validateIVs,
  validateEVs,
  validateNature,
  validateAbility,
  validateMoves,
} from "./rosterValidation";

describe("validateLevel", () => {
  it("accepts levels 1-100", () => {
    expect(validateLevel(1)).toBeNull();
    expect(validateLevel(100)).toBeNull();
    expect(validateLevel(50)).toBeNull();
  });

  it("rejects out-of-range or non-integer levels", () => {
    expect(validateLevel(0)).not.toBeNull();
    expect(validateLevel(101)).not.toBeNull();
    expect(validateLevel(50.5)).not.toBeNull();
  });
});

const validStats = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

describe("validateIVs", () => {
  it("accepts all-31 IVs with no errors", () => {
    expect(validateIVs(validStats)).toEqual([]);
  });

  it("rejects an IV above 31", () => {
    const errors = validateIVs({ ...validStats, atk: 32 });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe("iv_atk");
  });

  it("rejects a negative IV", () => {
    const errors = validateIVs({ ...validStats, spe: -1 });
    expect(errors.some((e) => e.field === "iv_spe")).toBe(true);
  });
});

describe("validateEVs", () => {
  it("accepts all-zero EVs with no errors", () => {
    expect(
      validateEVs({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 })
    ).toEqual([]);
  });

  it("rejects a single EV above 252", () => {
    const errors = validateEVs({ hp: 0, atk: 253, def: 0, spa: 0, spd: 0, spe: 0 });
    expect(errors.some((e) => e.field === "ev_atk")).toBe(true);
  });

  it("rejects a total EV sum above 510", () => {
    const errors = validateEVs({ hp: 252, atk: 252, def: 6, spa: 1, spd: 0, spe: 0 });
    expect(errors.some((e) => e.field === "evs")).toBe(true);
  });

  it("accepts a total EV sum of exactly 510", () => {
    const errors = validateEVs({ hp: 252, atk: 252, def: 6, spa: 0, spd: 0, spe: 0 });
    expect(errors).toEqual([]);
  });
});

describe("validateNature", () => {
  it("accepts a nature in the valid list", () => {
    expect(validateNature("Adamant", ["Adamant", "Hardy"])).toBeNull();
  });

  it("rejects a nature not in the valid list", () => {
    expect(validateNature("NotANature", ["Adamant", "Hardy"])).not.toBeNull();
  });
});

describe("validateAbility", () => {
  it("accepts an ability in the species' list", () => {
    expect(validateAbility("Sturdy", ["Sturdy", "Sand Veil"])).toBeNull();
  });

  it("rejects an ability not in the species' list", () => {
    expect(validateAbility("Levitate", ["Sturdy", "Sand Veil"])).not.toBeNull();
  });
});

describe("validateMoves", () => {
  it("accepts up to 4 moves all within the learnable pool", () => {
    expect(
      validateMoves(["Tackle", "Defense Curl"], ["Tackle", "Defense Curl", "Rock Throw"])
    ).toEqual([]);
  });

  it("rejects more than 4 moves", () => {
    const errors = validateMoves(["A", "B", "C", "D", "E"], ["A", "B", "C", "D", "E"]);
    expect(
      errors.some((e) => e.field === "moves" && e.message.includes("at most 4"))
    ).toBe(true);
  });

  it("rejects a move not in the learnable pool", () => {
    const errors = validateMoves(["Hyper Beam"], ["Tackle"]);
    expect(errors.some((e) => e.field === "moves")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run (from `web/`): `npm test`
Expected: FAIL — `Cannot find module './rosterValidation'`.

- [ ] **Step 3: Create `web/src/core/rosterValidation.ts`**

```ts
import type { StatBlock } from "./types";

export interface ValidationError {
  field: string;
  message: string;
}

const STAT_KEYS: (keyof StatBlock)[] = ["hp", "atk", "def", "spa", "spd", "spe"];

export function validateLevel(level: number): ValidationError | null {
  if (!Number.isInteger(level) || level < 1 || level > 100) {
    return {
      field: "level",
      message: "Level must be a whole number between 1 and 100.",
    };
  }
  return null;
}

export function validateIVs(ivs: StatBlock): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const key of STAT_KEYS) {
    const value = ivs[key];
    if (!Number.isInteger(value) || value < 0 || value > 31) {
      errors.push({
        field: `iv_${key}`,
        message: `${key.toUpperCase()} IV must be a whole number between 0 and 31.`,
      });
    }
  }
  return errors;
}

export function validateEVs(evs: StatBlock): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const key of STAT_KEYS) {
    const value = evs[key];
    if (!Number.isInteger(value) || value < 0 || value > 252) {
      errors.push({
        field: `ev_${key}`,
        message: `${key.toUpperCase()} EV must be a whole number between 0 and 252.`,
      });
    }
  }
  const total = STAT_KEYS.reduce((sum, key) => sum + (evs[key] || 0), 0);
  if (total > 510) {
    errors.push({
      field: "evs",
      message: `Total EVs must not exceed 510 (got ${total}).`,
    });
  }
  return errors;
}

export function validateNature(
  nature: string,
  validNatureNames: string[]
): ValidationError | null {
  if (!validNatureNames.includes(nature)) {
    return { field: "nature", message: `"${nature}" is not a valid nature.` };
  }
  return null;
}

export function validateAbility(
  ability: string,
  validAbilities: string[]
): ValidationError | null {
  if (!validAbilities.includes(ability)) {
    return {
      field: "ability",
      message: `"${ability}" is not an ability this species can have.`,
    };
  }
  return null;
}

export function validateMoves(
  moves: string[],
  learnablePool: string[]
): ValidationError[] {
  const errors: ValidationError[] = [];
  if (moves.length > 4) {
    errors.push({ field: "moves", message: "A Pokémon can know at most 4 moves." });
  }
  for (const move of moves) {
    if (!learnablePool.includes(move)) {
      errors.push({
        field: "moves",
        message: `"${move}" is not a move this Pokémon can learn in this game.`,
      });
    }
  }
  return errors;
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run (from `web/`): `npm test`
Expected: PASS — all 12 new `rosterValidation.test.ts` tests pass, plus all prior tests (14 + 12 = 26/26).

- [ ] **Step 5: Commit**

```bash
git add web/src/core/rosterValidation.ts web/src/core/rosterValidation.test.ts
git commit -m "Add roster field validation"
```

---

### Task 3: Roster database — `rosterDb.ts` + `rosterQueries.ts`

**Files:**
- Test: `web/src/core/rosterQueries.test.ts`
- Create: `web/src/core/rosterDb.ts`
- Create: `web/src/core/rosterQueries.ts`
- Modify: `.gitignore` (repo root)

**Interfaces:**
- Consumes: `RosterPokemon`, `NewRosterPokemon`, `StatBlock` types from `./types` (Task 1).
- Produces:
  - `getRosterDb(dbPath?: string): Database.Database` (from `rosterDb.ts`)
  - `addRosterPokemon(pokemon: NewRosterPokemon, options?: { dbPath?: string }): number`
  - `listRoster(game: string, options?: { dbPath?: string }): RosterPokemon[]`
  - `deleteRosterPokemon(id: number, options?: { dbPath?: string }): void`

- [ ] **Step 1: Add `roster.db` to the root `.gitignore`**

Append this line to the existing `.gitignore`:

```
roster.db
```

- [ ] **Step 2: Write the failing test file** — `web/src/core/rosterQueries.test.ts`

```ts
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
```

- [ ] **Step 3: Run the test and verify it fails**

Run (from `web/`): `npm test`
Expected: FAIL — `Cannot find module './rosterQueries'`.

- [ ] **Step 4: Create `web/src/core/rosterDb.ts`**

```ts
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
```

- [ ] **Step 5: Create `web/src/core/rosterQueries.ts`**

```ts
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
```

- [ ] **Step 6: Run the test and verify it passes**

Run (from `web/`): `npm test`
Expected: PASS — all 4 new `rosterQueries.test.ts` tests pass, plus all prior tests (26 + 4 = 30/30).

- [ ] **Step 7: Commit**

```bash
git add .gitignore web/src/core/rosterDb.ts web/src/core/rosterQueries.ts web/src/core/rosterQueries.test.ts
git commit -m "Add writable roster database (rosterDb, rosterQueries)"
```

---

### Task 4: Learnable-moves PokeAPI client

**Files:**
- Test: `web/src/core/movelearn.test.ts`
- Create: `web/src/core/movelearn.ts`

**Interfaces:**
- Consumes: `GAME_TO_VERSION_GROUP` from `./versionGroups` (Task 1), `LearnableMoves` type from `./types` (Task 1).
- Produces: `getLearnableMoves(species: string, game: string, options?: { cacheDir?: string; fetchImpl?: typeof fetch }): Promise<LearnableMoves | null>`

- [ ] **Step 1: Write the failing test file** — `web/src/core/movelearn.test.ts`

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getLearnableMoves } from "./movelearn";

function mockPokeApiResponse(
  moves: { name: string; versionGroup: string; method: string }[]
) {
  return {
    ok: true,
    json: async () => ({
      moves: moves.map((m) => ({
        move: { name: m.name },
        version_group_details: [
          {
            version_group: { name: m.versionGroup },
            move_learn_method: { name: m.method },
          },
        ],
      })),
    }),
  };
}

describe("getLearnableMoves", () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "movelearn-cache-"));
  });

  afterEach(async () => {
    await fs.rm(cacheDir, { recursive: true, force: true });
  });

  it("groups moves by learn method for the game's version group", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockPokeApiResponse([
        { name: "tackle", versionGroup: "red-blue", method: "level-up" },
        { name: "defense-curl", versionGroup: "red-blue", method: "level-up" },
        { name: "rock-slide", versionGroup: "red-blue", method: "machine" },
        { name: "sand-tomb", versionGroup: "red-blue", method: "tutor" },
        { name: "ancient-power", versionGroup: "red-blue", method: "egg" },
        { name: "future-sight", versionGroup: "gold-silver", method: "machine" },
      ])
    );

    const result = await getLearnableMoves("Geodude", "Red", { cacheDir, fetchImpl });

    expect(result).toEqual({
      levelUp: ["tackle", "defense-curl"],
      machine: ["rock-slide"],
      tutor: ["sand-tomb"],
      egg: ["ancient-power"],
    });
  });

  it("returns null for a game with no version-group mapping, without fetching", async () => {
    const fetchImpl = vi.fn();
    const result = await getLearnableMoves("Geodude", "NotAGame", {
      cacheDir,
      fetchImpl,
    });
    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("caches the result and does not refetch on a second call", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockPokeApiResponse([{ name: "tackle", versionGroup: "red-blue", method: "level-up" }])
    );

    await getLearnableMoves("Geodude", "Red", { cacheDir, fetchImpl });
    await getLearnableMoves("Geodude", "Red", { cacheDir, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("negative-caches a failed lookup so it does not refetch", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 });

    const first = await getLearnableMoves("Missingno", "Red", { cacheDir, fetchImpl });
    const second = await getLearnableMoves("Missingno", "Red", { cacheDir, fetchImpl });

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run (from `web/`): `npm test`
Expected: FAIL — `Cannot find module './movelearn'`.

- [ ] **Step 3: Create `web/src/core/movelearn.ts`**

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { GAME_TO_VERSION_GROUP } from "./versionGroups";
import type { LearnableMoves } from "./types";

const DEFAULT_CACHE_DIR = path.join(process.cwd(), ".cache", "pokeapi-moves");
const POKEAPI_BASE = "https://pokeapi.co/api/v2";

interface Options {
  cacheDir?: string;
  fetchImpl?: typeof fetch;
}

interface CacheMiss {
  __miss: true;
}

type CacheEntry = LearnableMoves | CacheMiss;

interface RawMoveEntry {
  move: { name: string };
  version_group_details: {
    version_group: { name: string };
    move_learn_method: { name: string };
  }[];
}

function isCacheMiss(entry: CacheEntry): entry is CacheMiss {
  return (entry as CacheMiss).__miss === true;
}

export async function getLearnableMoves(
  species: string,
  game: string,
  options: Options = {}
): Promise<LearnableMoves | null> {
  const versionGroup = GAME_TO_VERSION_GROUP[game];
  if (!versionGroup) return null;

  const cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;
  const fetchImpl = options.fetchImpl ?? fetch;
  const cacheKey = `${species.toLowerCase()}-${versionGroup}`;

  const cached = await readCache(cacheKey, cacheDir);
  if (cached) {
    return isCacheMiss(cached) ? null : cached;
  }

  const fetched = await fetchLearnableMoves(species, versionGroup, fetchImpl);
  try {
    await writeCache(cacheKey, cacheDir, fetched ?? { __miss: true });
  } catch (err) {
    console.error(`Failed to cache learnable moves for "${species}":`, err);
  }
  return fetched;
}

function cacheFilePath(cacheKey: string, cacheDir: string): string {
  return path.join(cacheDir, `${cacheKey}.json`);
}

async function readCache(
  cacheKey: string,
  cacheDir: string
): Promise<CacheEntry | null> {
  try {
    const raw = await fs.readFile(cacheFilePath(cacheKey, cacheDir), "utf-8");
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

async function writeCache(
  cacheKey: string,
  cacheDir: string,
  entry: CacheEntry
): Promise<void> {
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(cacheFilePath(cacheKey, cacheDir), JSON.stringify(entry), "utf-8");
}

async function fetchLearnableMoves(
  species: string,
  versionGroup: string,
  fetchImpl: typeof fetch
): Promise<LearnableMoves | null> {
  try {
    const res = await fetchImpl(
      `${POKEAPI_BASE}/pokemon/${encodeURIComponent(species.toLowerCase())}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) {
      console.error(
        `PokeAPI learnset request failed for species "${species}": HTTP ${res.status}`
      );
      return null;
    }

    const data = await res.json();
    const result: LearnableMoves = { levelUp: [], machine: [], tutor: [], egg: [] };

    for (const entry of data.moves as RawMoveEntry[]) {
      const matching = entry.version_group_details.filter(
        (d) => d.version_group.name === versionGroup
      );
      if (matching.length === 0) continue;

      const methods = new Set(matching.map((d) => d.move_learn_method.name));

      if (methods.has("level-up")) result.levelUp.push(entry.move.name);
      if (methods.has("machine")) result.machine.push(entry.move.name);
      if (methods.has("tutor")) result.tutor.push(entry.move.name);
      if (methods.has("egg")) result.egg.push(entry.move.name);
    }

    return result;
  } catch (err) {
    console.error(`PokeAPI learnset request failed for species "${species}":`, err);
    return null;
  }
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run (from `web/`): `npm test`
Expected: PASS — all 4 new `movelearn.test.ts` tests pass, plus all prior tests (30 + 4 = 34/34).

- [ ] **Step 5: Commit**

```bash
git add web/src/core/movelearn.ts web/src/core/movelearn.test.ts
git commit -m "Add PokeAPI learnable-moves client with negative caching"
```

---

### Task 5: Server Actions + roster page shell (list + delete)

**Files:**
- Create: `web/src/app/[game]/roster/actions.ts`
- Create: `web/src/app/[game]/roster/page.tsx`

**Interfaces:**
- Consumes: `getSpeciesInfo` from `@/core/pokeapi` (Phase 1); `getLearnableMoves` from `@/core/movelearn` (Task 4); `NATURES` from `@/core/natures` (Task 1); `validateLevel`, `validateIVs`, `validateEVs`, `validateNature`, `validateAbility`, `validateMoves`, `ValidationError` from `@/core/rosterValidation` (Task 2); `addRosterPokemon`, `listRoster`, `deleteRosterPokemon` from `@/core/rosterQueries` (Task 3); `StatBlock` from `@/core/types` (Task 1).
- Produces (consumed by Task 6):
  - `interface SpeciesOptions { abilities: string[]; moves: LearnableMoves | null }`
  - `getSpeciesOptions(species: string, game: string): Promise<SpeciesOptions | null>`
  - `interface AddRosterPokemonResult { success: boolean; errors: ValidationError[] }`
  - `addRosterPokemonAction(game: string, formData: FormData): Promise<AddRosterPokemonResult>`
  - `deleteRosterPokemonAction(game: string, id: number): Promise<void>`

- [ ] **Step 1: Create `web/src/app/[game]/roster/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getSpeciesInfo } from "@/core/pokeapi";
import { getLearnableMoves } from "@/core/movelearn";
import { NATURES } from "@/core/natures";
import {
  validateLevel,
  validateIVs,
  validateEVs,
  validateNature,
  validateAbility,
  validateMoves,
  type ValidationError,
} from "@/core/rosterValidation";
import {
  addRosterPokemon,
  deleteRosterPokemon as deleteRosterPokemonQuery,
} from "@/core/rosterQueries";
import type { LearnableMoves, StatBlock } from "@/core/types";

export interface SpeciesOptions {
  abilities: string[];
  moves: LearnableMoves | null;
}

export async function getSpeciesOptions(
  species: string,
  game: string
): Promise<SpeciesOptions | null> {
  const info = await getSpeciesInfo(species);
  if (!info) return null;
  const moves = await getLearnableMoves(species, game);
  return { abilities: info.abilities, moves };
}

export interface AddRosterPokemonResult {
  success: boolean;
  errors: ValidationError[];
}

export async function addRosterPokemonAction(
  game: string,
  formData: FormData
): Promise<AddRosterPokemonResult> {
  const species = String(formData.get("species") ?? "").trim();
  const level = Number(formData.get("level"));
  const nature = String(formData.get("nature") ?? "");
  const ability = String(formData.get("ability") ?? "");
  const moves = formData.getAll("moves").map(String);

  const readStat = (prefix: "iv" | "ev", stat: keyof StatBlock) =>
    Number(formData.get(`${prefix}_${stat}`));

  const ivs: StatBlock = {
    hp: readStat("iv", "hp"),
    atk: readStat("iv", "atk"),
    def: readStat("iv", "def"),
    spa: readStat("iv", "spa"),
    spd: readStat("iv", "spd"),
    spe: readStat("iv", "spe"),
  };
  const evs: StatBlock = {
    hp: readStat("ev", "hp"),
    atk: readStat("ev", "atk"),
    def: readStat("ev", "def"),
    spa: readStat("ev", "spa"),
    spd: readStat("ev", "spd"),
    spe: readStat("ev", "spe"),
  };

  const errors: ValidationError[] = [];

  const speciesInfo = await getSpeciesInfo(species);
  if (!speciesInfo) {
    errors.push({
      field: "species",
      message: `"${species}" is not a recognized Pokémon species.`,
    });
  }

  const levelError = validateLevel(level);
  if (levelError) errors.push(levelError);

  errors.push(...validateIVs(ivs));
  errors.push(...validateEVs(evs));

  const natureError = validateNature(nature, NATURES.map((n) => n.name));
  if (natureError) errors.push(natureError);

  if (speciesInfo) {
    const abilityError = validateAbility(ability, speciesInfo.abilities);
    if (abilityError) errors.push(abilityError);
  }

  const learnable = speciesInfo ? await getLearnableMoves(species, game) : null;
  if (learnable) {
    const pool = [
      ...learnable.levelUp,
      ...learnable.machine,
      ...learnable.tutor,
      ...learnable.egg,
    ];
    errors.push(...validateMoves(moves, pool));
  } else if (moves.length > 0) {
    errors.push({
      field: "moves",
      message: "Could not verify learnable moves for this species/game.",
    });
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  addRosterPokemon({ game, species, level, nature, ability, ivs, evs, moves });
  revalidatePath(`/${game}/roster`);
  return { success: true, errors: [] };
}

export async function deleteRosterPokemonAction(
  game: string,
  id: number
): Promise<void> {
  deleteRosterPokemonQuery(id);
  revalidatePath(`/${game}/roster`);
}
```

- [ ] **Step 2: Create `web/src/app/[game]/roster/page.tsx`**

```tsx
import { listRoster } from "@/core/rosterQueries";
import { deleteRosterPokemonAction } from "./actions";

export default async function RosterPage({
  params,
}: {
  params: Promise<{ game: string }>;
}) {
  const { game } = await params;
  const gameName = decodeURIComponent(game);
  const roster = listRoster(gameName);

  return (
    <main>
      <h1>{gameName} Roster</h1>
      {roster.length === 0 && <p>No Pokémon in this roster yet.</p>}
      <ul>
        {roster.map((pokemon) => (
          <li key={pokemon.id}>
            <h2>
              {pokemon.species} (Lv. {pokemon.level})
            </h2>
            <p>Nature: {pokemon.nature}</p>
            <p>Ability: {pokemon.ability}</p>
            <p>Moves: {pokemon.moves.join(", ") || "none"}</p>
            <form action={deleteRosterPokemonAction.bind(null, gameName, pokemon.id)}>
              <button type="submit">Delete</button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 3: Verify in the browser**

Run (from `web/`): `npm run dev &`, wait ~3s, then `curl -s http://localhost:3000/Red/roster` and confirm the output contains "Red Roster" and "No Pokémon in this roster yet." (the real `roster.db` is empty on a fresh checkout, so this is the expected state). Kill the dev server afterward (`kill %1`).

This confirms `actions.ts` and `page.tsx` wire together and `rosterDb`/`rosterQueries` work end-to-end against the real `roster.db` — the add/delete interactive paths are exercised fully in Task 6, once the add form exists.

- [ ] **Step 4: Commit**

```bash
git add "web/src/app/[game]/roster/actions.ts" "web/src/app/[game]/roster/page.tsx"
git commit -m "Add roster Server Actions and roster page shell (list + delete)"
```

---

### Task 6: Add-Pokémon form (client island)

**Files:**
- Create: `web/src/app/[game]/roster/AddPokemonForm.tsx`
- Modify: `web/src/app/[game]/roster/page.tsx`

**Interfaces:**
- Consumes: `addRosterPokemonAction`, `getSpeciesOptions`, `SpeciesOptions` from `./actions` (Task 5); `NATURES` from `@/core/natures` (Task 1); `ValidationError` from `@/core/rosterValidation` (Task 2).

- [ ] **Step 1: Create `web/src/app/[game]/roster/AddPokemonForm.tsx`**

```tsx
"use client";

import { useState } from "react";
import { addRosterPokemonAction, getSpeciesOptions, type SpeciesOptions } from "./actions";
import { NATURES } from "@/core/natures";
import type { ValidationError } from "@/core/rosterValidation";

const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;

export default function AddPokemonForm({ game }: { game: string }) {
  const [species, setSpecies] = useState("");
  const [options, setOptions] = useState<SpeciesOptions | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [errors, setErrors] = useState<ValidationError[]>([]);

  async function handleSpeciesBlur() {
    if (!species.trim()) {
      setOptions(null);
      return;
    }
    setLoadingOptions(true);
    const result = await getSpeciesOptions(species.trim(), game);
    setOptions(result);
    setLoadingOptions(false);
  }

  async function handleSubmit(formData: FormData) {
    const result = await addRosterPokemonAction(game, formData);
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    setSpecies("");
    setOptions(null);
  }

  const learnablePool = options?.moves
    ? [
        ...options.moves.levelUp.map((m) => ({ move: m, method: "Level-up" })),
        ...options.moves.machine.map((m) => ({ move: m, method: "TM/HM" })),
        ...options.moves.tutor.map((m) => ({ move: m, method: "Tutor" })),
        ...options.moves.egg.map((m) => ({ move: m, method: "Egg" })),
      ]
    : [];

  return (
    <form action={handleSubmit}>
      <h2>Add Pokémon</h2>

      {errors.length > 0 && (
        <ul>
          {errors.map((e, i) => (
            <li key={i}>{e.message}</li>
          ))}
        </ul>
      )}

      <label>
        Species
        <input
          name="species"
          value={species}
          onChange={(e) => setSpecies(e.target.value)}
          onBlur={handleSpeciesBlur}
          required
        />
      </label>

      {loadingOptions && <p>Looking up species...</p>}

      <label>
        Level
        <input name="level" type="number" min={1} max={100} required />
      </label>

      <label>
        Nature
        <select name="nature" required defaultValue="">
          <option value="" disabled>
            Choose a nature
          </option>
          {NATURES.map((n) => (
            <option key={n.name} value={n.name}>
              {n.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        Ability
        <select name="ability" required disabled={!options} defaultValue="">
          <option value="" disabled>
            Choose an ability
          </option>
          {options?.abilities.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend>IVs (0-31)</legend>
        {STAT_KEYS.map((stat) => (
          <label key={stat}>
            {stat.toUpperCase()}
            <input
              name={`iv_${stat}`}
              type="number"
              min={0}
              max={31}
              defaultValue={31}
              required
            />
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>EVs (0-252, total &le; 510)</legend>
        {STAT_KEYS.map((stat) => (
          <label key={stat}>
            {stat.toUpperCase()}
            <input
              name={`ev_${stat}`}
              type="number"
              min={0}
              max={252}
              defaultValue={0}
              required
            />
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Moveset (up to 4)</legend>
        {learnablePool.length === 0 && <p>Enter a species to see learnable moves.</p>}
        {learnablePool.map(({ move, method }) => (
          <label key={move}>
            <input type="checkbox" name="moves" value={move} />
            {move} ({method})
          </label>
        ))}
      </fieldset>

      <button type="submit" disabled={!options}>
        Add to roster
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Modify `web/src/app/[game]/roster/page.tsx`** to render the form

Add the import and render the component at the bottom of `<main>`, after the `<ul>`:

```tsx
import { listRoster } from "@/core/rosterQueries";
import { deleteRosterPokemonAction } from "./actions";
import AddPokemonForm from "./AddPokemonForm";

export default async function RosterPage({
  params,
}: {
  params: Promise<{ game: string }>;
}) {
  const { game } = await params;
  const gameName = decodeURIComponent(game);
  const roster = listRoster(gameName);

  return (
    <main>
      <h1>{gameName} Roster</h1>
      {roster.length === 0 && <p>No Pokémon in this roster yet.</p>}
      <ul>
        {roster.map((pokemon) => (
          <li key={pokemon.id}>
            <h2>
              {pokemon.species} (Lv. {pokemon.level})
            </h2>
            <p>Nature: {pokemon.nature}</p>
            <p>Ability: {pokemon.ability}</p>
            <p>Moves: {pokemon.moves.join(", ") || "none"}</p>
            <form action={deleteRosterPokemonAction.bind(null, gameName, pokemon.id)}>
              <button type="submit">Delete</button>
            </form>
          </li>
        ))}
      </ul>
      <AddPokemonForm game={gameName} />
    </main>
  );
}
```

- [ ] **Step 3: Verify end-to-end in the browser**

This step needs real interaction (species blur, dynamic dropdowns, form submit) — `curl` can't drive it. Use the Browser tool:

1. Run (from `web/`): `npm run dev &`, wait ~3s.
2. Load `http://localhost:3000/Yellow/roster` in the browser tool (an empty game context, since prior tasks tested against `Red`).
3. Fill the species field with `Pikachu` and trigger blur (e.g. click/tab to the next field). Wait for "Looking up species..." to disappear.
4. Confirm the Ability dropdown is now enabled and populated (Pikachu's real abilities from PokeAPI — e.g. Static, Lightning Rod).
5. Confirm the Moveset section now lists real learnable moves for Pikachu in Yellow, grouped by method.
6. Fill Level (e.g. `25`), pick a Nature, pick an Ability, leave IV/EV defaults, check 1-2 moves from the list.
7. Submit the form. Confirm the page updates to show Pikachu in the roster list above (species, level, nature, ability, the moves you picked).
8. Click that entry's "Delete" button. Confirm Pikachu is removed from the list and "No Pokémon in this roster yet." reappears.
9. Kill the dev server afterward.

If species lookup, form population, submission, or deletion doesn't work as described, investigate (check the browser console for errors) before reporting done.

- [ ] **Step 4: Commit**

```bash
git add "web/src/app/[game]/roster/AddPokemonForm.tsx" "web/src/app/[game]/roster/page.tsx"
git commit -m "Add interactive add-Pokémon form with species lookup"
```

---

## Self-Review Notes

- **Spec coverage:** storage/schema (Task 3), Server Actions not a REST API (Task 5), version-group mapping (Task 1), learnable-moves module + graceful degradation (Task 4), UI flow including the single client island for species→abilities/moveset lookup (Task 6), validation as a separate framework-free module (Task 2), error handling (validation errors surfaced in the form, PokeAPI failures returning `null` gracefully, idempotent delete). Testing approach (Vitest for every `core/` module, manual verification for pages/actions) matches every task. The two out-of-scope items from the spec (editing an entry, held items) are correctly absent from every task.
- **Placeholder scan:** none — every step has full file contents or an exact command with an exact expected result.
- **Type consistency:** `StatBlock`, `Nature`, `RosterPokemon`, `NewRosterPokemon`, `LearnableMoves` are defined once in Task 1's `types.ts` and reused verbatim by every later task; `SpeciesOptions`/`AddRosterPokemonResult` from Task 5's `actions.ts` are consumed with matching shapes in Task 6's `AddPokemonForm.tsx`; `ValidationError` from Task 2 flows through Task 5 into Task 6 unchanged.
