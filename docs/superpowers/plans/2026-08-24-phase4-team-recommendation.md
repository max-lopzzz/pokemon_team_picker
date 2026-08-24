# Phase 4: Team Recommendation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Given a roster and a gym leader encounter, recommend up to 6 roster Pokémon (each with a specific move) to field against that encounter's team, using the four battle engines built in Phase 3.

**Architecture:** A normalizing adapter (`matchupEngines.ts`) flattens the four battle engines' differing result shapes into one; pure scoring/team-assembly logic (`recommendation.ts`) works only with that normalized shape; a Server Action (`actions.ts`) wires the database queries and the adapter together; a small Client Component adds a "Recommend team" button to the existing encounter page.

**Tech Stack:** TypeScript, Vitest, Next.js Server Actions. Builds directly on every Phase 3 battle engine and Phase 1/2's existing queries.

**Spec:** [docs/superpowers/specs/2026-08-24-phase4-team-recommendation-design.md](../specs/2026-08-24-phase4-team-recommendation-design.md)

## Global Constraints

- `core/` modules have zero Next.js/React imports (`matchupEngines.ts`, `recommendation.ts`, and the `getGameGeneration` addition to `queries.ts` all live in `web/src/core/`).
- Scoring uses only each engine's `normal` (non-crit) outcome — `matchup.ts`'s flat result has nothing else, and this keeps the formula identical across all four eras.
- Recommend only from a roster Pokémon's already-selected moveset (Phase 2) — never the full learnable pool.
- **The opponent's own stats, when it is the attacker** (computing damage it deals to you), use the exact same convention every Phase 3 engine already applies when a trainer Pokémon is the *defender*: perfect IVs (31 all), zero EVs, neutral ("Hardy") nature. One consistent rule for "a trainer Pokémon with no real stat data," regardless of which side of an exchange it's on.
- **`Infinity` must never reach the Server Action's return value un-clamped** — `gen1Matchup.ts`'s own JSDoc documents that `JSON.stringify(Infinity) === "null"`, so a raw `Infinity` crossing the Server Action boundary would silently vanish into `null` instead of rendering as "can't KO this." Every hits-to-KO value stored in a `MatchupScore` must already be clamped via `HITS_TO_KO_SENTINEL` before it's returned.
- Any individual `evaluateNormalizedMatchup` call returning `null` (failed lookup, status move, unresolvable historical typing) excludes that move from consideration — never treated as a zero-damage result.
- `queries.ts`'s `getDb()` is hardcoded to the real, read-only `gym_leaders.db` at the repo root (no `dbPath` parameter) — tests against it use real committed data (e.g. `"Red"` → generation `1`), not a temp fixture.

---

### Task 1: `getGameGeneration` query

**Files:**
- Modify: `web/src/core/queries.ts`
- Modify: `web/src/core/queries.test.ts`

**Interfaces:**
- Produces: `getGameGeneration(gameName: string): number | null`.

- [ ] **Step 1: Write the failing test**

Add `getGameGeneration` to the existing import line at the top of `web/src/core/queries.test.ts`:

```ts
import {
  listGenerations,
  listGames,
  listGyms,
  listEncounters,
  getEncounterTeam,
  getGameGeneration,
} from "./queries";
```

Add this new `describe` block at the end of the file (leave every existing block unchanged):

```ts
describe("getGameGeneration", () => {
  it("returns the generation number for a known game", () => {
    expect(getGameGeneration("Red")).toBe(1);
  });

  it("returns null for an unknown game name", () => {
    expect(getGameGeneration("NotAGame")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run (from `web/`): `npm test -- src/core/queries.test.ts`
Expected: FAIL — `getGameGeneration is not a function` or similar.

- [ ] **Step 3: Add `getGameGeneration` to `web/src/core/queries.ts`**

Add this export at the end of the file:

```ts
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
```

- [ ] **Step 4: Run the test and verify it passes**

Run (from `web/`): `npm test`
Expected: PASS — both new tests, plus every prior test, pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/core/queries.ts web/src/core/queries.test.ts
git commit -m "Add getGameGeneration query"
```

---

### Task 2: Battle engine dispatch adapter

**Files:**
- Test: `web/src/core/matchupEngines.test.ts`
- Create: `web/src/core/matchupEngines.ts`

**Interfaces:**
- Consumes: `evaluateMatchup` from `./matchup`; `evaluateGen1Matchup` from `./gen1Matchup`; `evaluateGen23Matchup` from `./gen23Matchup`; `evaluateGen45Matchup` from `./gen45Matchup`; `StatBlock` from `./types` (all existing, Phase 3).
- Produces: `interface NormalizedMatchup { hitsToKO: {min,max}; movesFirst: "attacker"|"defender"|"tie" }`, `interface MatchupAttackerInput`, `interface MatchupDefenderInput`, `evaluateNormalizedMatchup(generation: number, attacker: MatchupAttackerInput, attackerMove: string, defender: MatchupDefenderInput): Promise<NormalizedMatchup | null>`.

- [ ] **Step 1: Write the failing test file** — `web/src/core/matchupEngines.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { evaluateNormalizedMatchup } from "./matchupEngines";
import { evaluateMatchup } from "./matchup";
import { evaluateGen1Matchup } from "./gen1Matchup";
import { evaluateGen23Matchup } from "./gen23Matchup";
import { evaluateGen45Matchup } from "./gen45Matchup";
import type { StatBlock } from "./types";

vi.mock("./matchup", () => ({ evaluateMatchup: vi.fn() }));
vi.mock("./gen1Matchup", () => ({ evaluateGen1Matchup: vi.fn() }));
vi.mock("./gen23Matchup", () => ({ evaluateGen23Matchup: vi.fn() }));
vi.mock("./gen45Matchup", () => ({ evaluateGen45Matchup: vi.fn() }));

const mockedEvaluateMatchup = vi.mocked(evaluateMatchup);
const mockedEvaluateGen1Matchup = vi.mocked(evaluateGen1Matchup);
const mockedEvaluateGen23Matchup = vi.mocked(evaluateGen23Matchup);
const mockedEvaluateGen45Matchup = vi.mocked(evaluateGen45Matchup);

const ivs: StatBlock = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const evs: StatBlock = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

const attacker = { species: "Pikachu", level: 50, ivs, evs, nature: "Hardy" };
const defender = { species: "Onix", level: 20 };

describe("evaluateNormalizedMatchup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generation 1: calls evaluateGen1Matchup, omitting nature from the attacker object", async () => {
    mockedEvaluateGen1Matchup.mockResolvedValue({
      normal: { damageRange: { min: 10, max: 12 }, hitsToKO: { min: 2, max: 3 } },
      criticalHit: { chance: 0.1, damageRange: { min: 20, max: 24 }, hitsToKO: { min: 1, max: 1 } },
      moveOrder: "attacker",
    });

    const result = await evaluateNormalizedMatchup(1, attacker, "Thunderbolt", defender);

    expect(mockedEvaluateGen1Matchup).toHaveBeenCalledWith({
      attacker: { species: "Pikachu", level: 50, ivs, evs },
      attackerMove: "Thunderbolt",
      defender: { species: "Onix", level: 20 },
    });
    expect(result).toEqual({ hitsToKO: { min: 2, max: 3 }, movesFirst: "attacker" });
  });

  it("generation 2: calls evaluateGen23Matchup with generation 2", async () => {
    mockedEvaluateGen23Matchup.mockResolvedValue({
      normal: { damageRange: { min: 5, max: 6 }, hitsToKO: { min: 4, max: 5 } },
      criticalHit: { chance: 17 / 256, damageRange: { min: 10, max: 12 }, hitsToKO: { min: 2, max: 2 } },
      moveOrder: "defender",
    });

    const result = await evaluateNormalizedMatchup(2, attacker, "Thunderbolt", defender);

    expect(mockedEvaluateGen23Matchup).toHaveBeenCalledWith({
      generation: 2,
      attacker: { species: "Pikachu", level: 50, ivs, evs, nature: "Hardy" },
      attackerMove: "Thunderbolt",
      defender: { species: "Onix", level: 20 },
    });
    expect(result).toEqual({ hitsToKO: { min: 4, max: 5 }, movesFirst: "defender" });
  });

  it("generation 3: calls evaluateGen23Matchup with generation 3", async () => {
    mockedEvaluateGen23Matchup.mockResolvedValue({
      normal: { damageRange: { min: 5, max: 6 }, hitsToKO: { min: 4, max: 5 } },
      criticalHit: { chance: 1 / 16, damageRange: { min: 10, max: 12 }, hitsToKO: { min: 2, max: 2 } },
      moveOrder: "tie",
    });

    const result = await evaluateNormalizedMatchup(3, attacker, "Thunderbolt", defender);

    expect(mockedEvaluateGen23Matchup).toHaveBeenCalledWith({
      generation: 3,
      attacker: { species: "Pikachu", level: 50, ivs, evs, nature: "Hardy" },
      attackerMove: "Thunderbolt",
      defender: { species: "Onix", level: 20 },
    });
    expect(result).toEqual({ hitsToKO: { min: 4, max: 5 }, movesFirst: "tie" });
  });

  it("generation 4: calls evaluateGen45Matchup with generation 4", async () => {
    mockedEvaluateGen45Matchup.mockResolvedValue({
      normal: { damageRange: { min: 8, max: 9 }, hitsToKO: { min: 3, max: 3 } },
      criticalHit: { chance: 1 / 16, damageRange: { min: 16, max: 18 }, hitsToKO: { min: 2, max: 2 } },
      moveOrder: "attacker",
    });

    const result = await evaluateNormalizedMatchup(4, attacker, "Thunderbolt", defender);

    expect(mockedEvaluateGen45Matchup).toHaveBeenCalledWith({
      generation: 4,
      attacker: { species: "Pikachu", level: 50, ivs, evs, nature: "Hardy" },
      attackerMove: "Thunderbolt",
      defender: { species: "Onix", level: 20 },
    });
    expect(result).toEqual({ hitsToKO: { min: 3, max: 3 }, movesFirst: "attacker" });
  });

  it("generation 5: calls evaluateGen45Matchup with generation 5", async () => {
    mockedEvaluateGen45Matchup.mockResolvedValue({
      normal: { damageRange: { min: 8, max: 9 }, hitsToKO: { min: 3, max: 3 } },
      criticalHit: { chance: 1 / 16, damageRange: { min: 16, max: 18 }, hitsToKO: { min: 2, max: 2 } },
      moveOrder: "defender",
    });

    const result = await evaluateNormalizedMatchup(5, attacker, "Thunderbolt", defender);

    expect(mockedEvaluateGen45Matchup).toHaveBeenCalledWith({
      generation: 5,
      attacker: { species: "Pikachu", level: 50, ivs, evs, nature: "Hardy" },
      attackerMove: "Thunderbolt",
      defender: { species: "Onix", level: 20 },
    });
    expect(result).toEqual({ hitsToKO: { min: 3, max: 3 }, movesFirst: "defender" });
  });

  it("generation 6 and above: calls evaluateMatchup, passing dynamaxState through", async () => {
    mockedEvaluateMatchup.mockResolvedValue({
      damageRange: { min: 15, max: 18 },
      hitsToKO: { min: 1, max: 1 },
      moveOrder: "attacker",
    });

    const result = await evaluateNormalizedMatchup(9, attacker, "Thunderbolt", {
      ...defender,
      dynamaxState: "dynamax",
    });

    expect(mockedEvaluateMatchup).toHaveBeenCalledWith({
      attacker: { species: "Pikachu", level: 50, ivs, evs, nature: "Hardy" },
      attackerMove: "Thunderbolt",
      defender: { species: "Onix", level: 20, dynamaxState: "dynamax" },
    });
    expect(result).toEqual({ hitsToKO: { min: 1, max: 1 }, movesFirst: "attacker" });
  });

  it("defaults dynamaxState to null when not provided, for a Gen 6-9 call", async () => {
    mockedEvaluateMatchup.mockResolvedValue({
      damageRange: { min: 15, max: 18 },
      hitsToKO: { min: 1, max: 1 },
      moveOrder: "attacker",
    });

    await evaluateNormalizedMatchup(8, attacker, "Thunderbolt", defender);

    expect(mockedEvaluateMatchup).toHaveBeenCalledWith({
      attacker: { species: "Pikachu", level: 50, ivs, evs, nature: "Hardy" },
      attackerMove: "Thunderbolt",
      defender: { species: "Onix", level: 20, dynamaxState: null },
    });
  });

  it("propagates null from the underlying engine (generation 1)", async () => {
    mockedEvaluateGen1Matchup.mockResolvedValue(null);
    const result = await evaluateNormalizedMatchup(1, attacker, "Thunderbolt", defender);
    expect(result).toBeNull();
  });

  it("propagates null from the underlying engine (generation 6-9)", async () => {
    mockedEvaluateMatchup.mockResolvedValue(null);
    const result = await evaluateNormalizedMatchup(6, attacker, "Thunderbolt", defender);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run (from `web/`): `npm test -- src/core/matchupEngines.test.ts`
Expected: FAIL — `Cannot find module './matchupEngines'`.

- [ ] **Step 3: Create `web/src/core/matchupEngines.ts`**

```ts
import { evaluateMatchup } from "./matchup";
import { evaluateGen1Matchup } from "./gen1Matchup";
import { evaluateGen23Matchup } from "./gen23Matchup";
import { evaluateGen45Matchup } from "./gen45Matchup";
import type { StatBlock } from "./types";

export interface NormalizedMatchup {
  hitsToKO: { min: number; max: number };
  movesFirst: "attacker" | "defender" | "tie";
}

export interface MatchupAttackerInput {
  species: string;
  level: number;
  ivs: StatBlock;
  evs: StatBlock;
  nature: string;
}

export interface MatchupDefenderInput {
  species: string;
  level: number;
  dynamaxState?: string | null; // only meaningful for generation 6-9
}

/** Dispatches to the right Phase 3 battle engine for `generation` and
 * flattens its result into one shape. Reads only each engine's `normal`
 * (non-crit) outcome — `matchup.ts` (Gen 6-9) has no crit split anyway,
 * so this keeps the shape identical regardless of era. Returns `null` if
 * the underlying engine call does (any failed lookup, a status move, an
 * unresolvable historical typing). */
export async function evaluateNormalizedMatchup(
  generation: number,
  attacker: MatchupAttackerInput,
  attackerMove: string,
  defender: MatchupDefenderInput
): Promise<NormalizedMatchup | null> {
  if (generation === 1) {
    const result = await evaluateGen1Matchup({
      attacker: {
        species: attacker.species,
        level: attacker.level,
        ivs: attacker.ivs,
        evs: attacker.evs,
      },
      attackerMove,
      defender: { species: defender.species, level: defender.level },
    });
    if (!result) return null;
    return { hitsToKO: result.normal.hitsToKO, movesFirst: result.moveOrder };
  }

  if (generation === 2 || generation === 3) {
    const result = await evaluateGen23Matchup({
      generation,
      attacker: {
        species: attacker.species,
        level: attacker.level,
        ivs: attacker.ivs,
        evs: attacker.evs,
        nature: attacker.nature,
      },
      attackerMove,
      defender: { species: defender.species, level: defender.level },
    });
    if (!result) return null;
    return { hitsToKO: result.normal.hitsToKO, movesFirst: result.moveOrder };
  }

  if (generation === 4 || generation === 5) {
    const result = await evaluateGen45Matchup({
      generation,
      attacker: {
        species: attacker.species,
        level: attacker.level,
        ivs: attacker.ivs,
        evs: attacker.evs,
        nature: attacker.nature,
      },
      attackerMove,
      defender: { species: defender.species, level: defender.level },
    });
    if (!result) return null;
    return { hitsToKO: result.normal.hitsToKO, movesFirst: result.moveOrder };
  }

  // Generation 6-9 (and any other value) uses the modern engine.
  const result = await evaluateMatchup({
    attacker: {
      species: attacker.species,
      level: attacker.level,
      ivs: attacker.ivs,
      evs: attacker.evs,
      nature: attacker.nature,
    },
    attackerMove,
    defender: {
      species: defender.species,
      level: defender.level,
      dynamaxState: defender.dynamaxState ?? null,
    },
  });
  if (!result) return null;
  return { hitsToKO: result.hitsToKO, movesFirst: result.moveOrder };
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run (from `web/`): `npm test`
Expected: PASS — all 9 new tests, plus every prior test, pass.

- [ ] **Step 5: Run the typecheck**

Run (from `web/`): `npx tsc --noEmit`
Expected: clean, no errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/core/matchupEngines.ts web/src/core/matchupEngines.test.ts
git commit -m "Add battle-engine dispatch adapter (evaluateNormalizedMatchup)"
```

---

### Task 3: Scoring and team-assembly logic

**Files:**
- Test: `web/src/core/recommendation.test.ts`
- Create: `web/src/core/recommendation.ts`

**Interfaces:**
- Consumes: `NormalizedMatchup` from `./matchupEngines` (Task 2); `RosterPokemon`, `EncounterPokemon` from `./types`.
- Produces: `interface MatchupScore`, `scoreMatchup(myMatchups, theirMatchups): MatchupScore | null`; `interface TeamAssignment`, `interface AssembledTeam`, `assembleTeam(scoreMatrix, roster, opponents): AssembledTeam`.

- [ ] **Step 1: Write the failing test file** — `web/src/core/recommendation.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { scoreMatchup, assembleTeam, type MatchupScore } from "./recommendation";
import type { NormalizedMatchup } from "./matchupEngines";
import type { RosterPokemon, EncounterPokemon } from "./types";

const zeroStats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

function rosterMon(id: number, species: string): RosterPokemon {
  return {
    id,
    game: "Red",
    species,
    level: 50,
    nature: "Hardy",
    ability: "Static",
    ivs: zeroStats,
    evs: zeroStats,
    moves: ["Move"],
  };
}

function opponentMon(position: number, species: string): EncounterPokemon {
  return {
    id: position,
    position,
    species,
    level: 50,
    gender: null,
    heldItem: null,
    dynamax: null,
    moves: ["Move"],
  };
}

describe("scoreMatchup", () => {
  it("computes the score from the average of the range plus a speed bonus", () => {
    const myMatchups = [
      { move: "A", result: { hitsToKO: { min: 2, max: 3 }, movesFirst: "attacker" as const } },
    ];
    const theirMatchups: NormalizedMatchup[] = [
      { hitsToKO: { min: 4, max: 5 }, movesFirst: "attacker" },
    ];

    const result = scoreMatchup(myMatchups, theirMatchups);

    // theirAvg=4.5, myAvg=2.5, speedBonus=0.5 (movesFirst="attacker") -> score=(4.5-2.5)+0.5=2.5
    expect(result).toEqual({
      score: 2.5,
      move: "A",
      myHitsToKO: { min: 2, max: 3 },
      theirHitsToKoTaken: { min: 4, max: 5 },
      movesFirst: "attacker",
    });
  });

  it("picks the best-scoring of several of my candidate moves", () => {
    const myMatchups = [
      { move: "Weak", result: { hitsToKO: { min: 5, max: 6 }, movesFirst: "attacker" as const } },
      { move: "Strong", result: { hitsToKO: { min: 2, max: 2 }, movesFirst: "attacker" as const } },
    ];
    const theirMatchups: NormalizedMatchup[] = [
      { hitsToKO: { min: 4, max: 4 }, movesFirst: "attacker" },
    ];

    const result = scoreMatchup(myMatchups, theirMatchups);

    // Weak: (4-5.5)+0.5=-1.0. Strong: (4-2)+0.5=2.5. Strong wins.
    expect(result!.move).toBe("Strong");
    expect(result!.score).toBe(2.5);
  });

  it("picks the worst-case (fewest hits, most dangerous) of their candidate moves", () => {
    const myMatchups = [
      { move: "M", result: { hitsToKO: { min: 3, max: 3 }, movesFirst: "attacker" as const } },
    ];
    const theirMatchups: NormalizedMatchup[] = [
      { hitsToKO: { min: 6, max: 6 }, movesFirst: "attacker" }, // less dangerous
      { hitsToKO: { min: 2, max: 2 }, movesFirst: "attacker" }, // more dangerous
    ];

    const result = scoreMatchup(myMatchups, theirMatchups);

    expect(result!.theirHitsToKoTaken).toEqual({ min: 2, max: 2 });
    // theirAvg=2, myAvg=3, speedBonus=0.5 -> score=(2-3)+0.5=-0.5
    expect(result!.score).toBe(-0.5);
  });

  it("applies the correct speed bonus for each movesFirst value", () => {
    const theirMatchups: NormalizedMatchup[] = [
      { hitsToKO: { min: 4, max: 4 }, movesFirst: "attacker" },
    ];

    const attackerFirst = scoreMatchup(
      [{ move: "M", result: { hitsToKO: { min: 2, max: 2 }, movesFirst: "attacker" } }],
      theirMatchups
    );
    const tie = scoreMatchup(
      [{ move: "M", result: { hitsToKO: { min: 2, max: 2 }, movesFirst: "tie" } }],
      theirMatchups
    );
    const defenderFirst = scoreMatchup(
      [{ move: "M", result: { hitsToKO: { min: 2, max: 2 }, movesFirst: "defender" } }],
      theirMatchups
    );

    // Base (4-2) = 2, then +0.5 / +0 / -0.5.
    expect(attackerFirst!.score).toBe(2.5);
    expect(tie!.score).toBe(2);
    expect(defenderFirst!.score).toBe(1.5);
  });

  it("returns null when I have no usable moves against this opponent", () => {
    const theirMatchups: NormalizedMatchup[] = [
      { hitsToKO: { min: 4, max: 4 }, movesFirst: "attacker" },
    ];
    expect(scoreMatchup([], theirMatchups)).toBeNull();
  });

  it("returns null when the opponent has no usable moves against me", () => {
    const myMatchups = [
      { move: "M", result: { hitsToKO: { min: 2, max: 2 }, movesFirst: "attacker" as const } },
    ];
    expect(scoreMatchup(myMatchups, [])).toBeNull();
  });

  it("clamps a genuine double-immunity case (both sides Infinity) without producing NaN", () => {
    const myMatchups = [
      { move: "M", result: { hitsToKO: { min: Infinity, max: Infinity }, movesFirst: "attacker" as const } },
    ];
    const theirMatchups: NormalizedMatchup[] = [
      { hitsToKO: { min: Infinity, max: Infinity }, movesFirst: "attacker" },
    ];

    const result = scoreMatchup(myMatchups, theirMatchups);

    expect(result).not.toBeNull();
    expect(result!.score).not.toBeNaN();
    expect(result!.myHitsToKO).toEqual({ min: 1000, max: 1000 });
    expect(result!.theirHitsToKoTaken).toEqual({ min: 1000, max: 1000 });
    // (1000-1000)+0.5 = 0.5
    expect(result!.score).toBe(0.5);
  });
});

describe("assembleTeam", () => {
  it("uses bottleneck-first assignment to achieve full coverage where naive left-to-right would leave a gap", () => {
    // Roster: A (id 1), B (id 2), C (id 3). Opponents: X, Y, Z (positions 1,2,3).
    // A beats X well (10) and Y well (8). B beats Y okay (5) but is the
    // ONLY one who can score Z at all (3). C is weak everywhere it scores
    // (X:1, Y:2) and cannot score Z at all (null).
    //
    // Naive left-to-right (X, Y, Z in order): X->A(10), Y->B(5) [A used],
    // Z-> only C left, but C has no score for Z -> Z UNCOVERED.
    //
    // Bottleneck-first: Z's best-available score (3, only B) is the
    // lowest of any opponent's best-available score in the first pass,
    // so Z is assigned first (to B), reserving B before it could be
    // claimed by Y. Then Y's best-available (8, A) beats X's (10, A) as
    // the next-lowest remaining bottleneck... actually X's best (10) >
    // Y's best (8), so Y is the next bottleneck -> Y gets A. Finally X
    // gets whichever roster Pokémon is left: C (1). All three covered.
    function mockScore(score: number, move: string): MatchupScore {
      return {
        score,
        move,
        myHitsToKO: { min: 1, max: 1 },
        theirHitsToKoTaken: { min: 1, max: 1 },
        movesFirst: "attacker",
      };
    }

    const roster = [rosterMon(1, "A"), rosterMon(2, "B"), rosterMon(3, "C")];
    const opponents = [opponentMon(1, "X"), opponentMon(2, "Y"), opponentMon(3, "Z")];

    // scoreMatrix[rosterIndex][opponentIndex]
    const scoreMatrix: (MatchupScore | null)[][] = [
      [mockScore(10, "m1"), mockScore(8, "m2"), null], // A vs X, Y, Z
      [null, mockScore(5, "m3"), mockScore(3, "m4")], // B vs X, Y, Z
      [mockScore(1, "m5"), mockScore(2, "m6"), null], // C vs X, Y, Z
    ];

    const result = assembleTeam(scoreMatrix, roster, opponents);

    expect(result.uncoveredOpponents).toEqual([]);
    expect(result.assignments).toHaveLength(3);

    const byOpponent = (species: string) =>
      result.assignments.find((a) => a.opponent.species === species)!;

    expect(byOpponent("Z").species).toBe("B");
    expect(byOpponent("Z").move).toBe("m4");
    expect(byOpponent("Y").species).toBe("A");
    expect(byOpponent("Y").move).toBe("m2");
    expect(byOpponent("X").species).toBe("C");
    expect(byOpponent("X").move).toBe("m5");
  });

  it("marks an opponent with zero scoreable roster Pokémon as uncovered immediately", () => {
    const roster = [rosterMon(1, "A")];
    const opponents = [opponentMon(1, "X")];
    const scoreMatrix: (MatchupScore | null)[][] = [[null]];

    const result = assembleTeam(scoreMatrix, roster, opponents);

    expect(result.assignments).toEqual([]);
    expect(result.uncoveredOpponents).toEqual([
      { species: "X", position: 1, reason: "no roster Pokémon scored a usable matchup" },
    ]);
  });

  it("marks an opponent uncovered when the roster runs out mid-assignment", () => {
    // Only one roster Pokémon, two opponents both scoreable by it.
    function mockScore(score: number): MatchupScore {
      return {
        score,
        move: "M",
        myHitsToKO: { min: 1, max: 1 },
        theirHitsToKoTaken: { min: 1, max: 1 },
        movesFirst: "attacker",
      };
    }
    const roster = [rosterMon(1, "A")];
    const opponents = [opponentMon(1, "X"), opponentMon(2, "Y")];
    const scoreMatrix: (MatchupScore | null)[][] = [[mockScore(5), mockScore(3)]];

    const result = assembleTeam(scoreMatrix, roster, opponents);

    expect(result.assignments).toHaveLength(1);
    // Y is the bottleneck (lower score, 3 < 5), so A is assigned to Y first.
    expect(result.assignments[0].opponent.species).toBe("Y");
    expect(result.uncoveredOpponents).toEqual([
      { species: "X", position: 1, reason: "roster too small to cover every opponent" },
    ]);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run (from `web/`): `npm test -- src/core/recommendation.test.ts`
Expected: FAIL — `Cannot find module './recommendation'`.

- [ ] **Step 3: Create `web/src/core/recommendation.ts`**

```ts
import type { NormalizedMatchup } from "./matchupEngines";
import type { RosterPokemon, EncounterPokemon } from "./types";

export interface MatchupScore {
  score: number; // higher is better
  move: string;
  myHitsToKO: { min: number; max: number };
  theirHitsToKoTaken: { min: number; max: number };
  movesFirst: "attacker" | "defender" | "tie";
}

// Stands in for Infinity — both so subtraction never produces NaN, and so
// this value survives the Server Action boundary as a real (very large)
// number instead of silently becoming null (JSON.stringify(Infinity) is
// "null" — see gen1Matchup.ts's own JSDoc on this exact hazard).
const HITS_TO_KO_SENTINEL = 1000;

function clampRange(range: { min: number; max: number }): { min: number; max: number } {
  const clamp = (n: number) => (n === Infinity ? HITS_TO_KO_SENTINEL : n);
  return { min: clamp(range.min), max: clamp(range.max) };
}

function averageHits(range: { min: number; max: number }): number {
  return (range.min + range.max) / 2; // call only on an already-clamped range
}

function matchupScore(
  myHitsToKO: number,
  theirHitsToKoTaken: number,
  movesFirst: "attacker" | "defender" | "tie"
): number {
  const speedBonus = movesFirst === "attacker" ? 0.5 : movesFirst === "tie" ? 0 : -0.5;
  return (theirHitsToKoTaken - myHitsToKO) + speedBonus;
}

/** Scores one (roster Pokémon, opposing Pokémon) pairing. `theirHitsToKoTaken`
 * is fixed for the pairing (whichever of their moves needs the fewest
 * hits to KO me); each of my candidate moves is then scored against that
 * fixed value, and the best-scoring one wins. Returns `null` if either
 * side has no usable moves (every one failed lookup, or was a status
 * move) — this pairing has no usable score, not a score of 0. */
export function scoreMatchup(
  myMatchups: { move: string; result: NormalizedMatchup }[],
  theirMatchups: NormalizedMatchup[]
): MatchupScore | null {
  if (myMatchups.length === 0 || theirMatchups.length === 0) return null;

  const theirClampedRanges = theirMatchups.map((m) => clampRange(m.hitsToKO));
  const theirHitsToKoTaken = theirClampedRanges.reduce((worst, r) =>
    averageHits(r) < averageHits(worst) ? r : worst
  );
  const theirAvg = averageHits(theirHitsToKoTaken);

  let best: MatchupScore | null = null;
  for (const { move, result } of myMatchups) {
    const myHitsToKO = clampRange(result.hitsToKO);
    const score = matchupScore(averageHits(myHitsToKO), theirAvg, result.movesFirst);
    if (!best || score > best.score) {
      best = { score, move, myHitsToKO, theirHitsToKoTaken, movesFirst: result.movesFirst };
    }
  }
  return best;
}

export interface TeamAssignment {
  opponent: { species: string; position: number };
  rosterPokemonId: number;
  species: string;
  move: string;
  summary: MatchupScore;
}

export interface AssembledTeam {
  assignments: TeamAssignment[];
  uncoveredOpponents: { species: string; position: number; reason: string }[];
}

/** Bottleneck-first greedy team assembly: repeatedly finds the opponent
 * whose best-available score (across not-yet-used roster Pokémon) is
 * LOWEST, and assigns that opponent's best-available roster Pokémon to
 * it — this reserves scarce answers for the opponents that need them
 * most, instead of a fixed-order pass letting an early opponent claim a
 * roster Pokémon that only it could otherwise beat. */
export function assembleTeam(
  scoreMatrix: (MatchupScore | null)[][], // [rosterIndex][opponentIndex]
  roster: RosterPokemon[],
  opponents: EncounterPokemon[]
): AssembledTeam {
  const assignments: TeamAssignment[] = [];
  const uncoveredOpponents: { species: string; position: number; reason: string }[] = [];

  // Pre-filter: an opponent nobody in the roster can score at all is
  // uncovered immediately, before the assignment loop even starts.
  const scoreableOpponentIndices: number[] = [];
  opponents.forEach((opponent, opponentIndex) => {
    const hasAnyScore = scoreMatrix.some((row) => row[opponentIndex] !== null);
    if (hasAnyScore) {
      scoreableOpponentIndices.push(opponentIndex);
    } else {
      uncoveredOpponents.push({
        species: opponent.species,
        position: opponent.position,
        reason: "no roster Pokémon scored a usable matchup",
      });
    }
  });

  const usedRosterIndices = new Set<number>();
  const remainingOpponentIndices = new Set(scoreableOpponentIndices);

  while (remainingOpponentIndices.size > 0) {
    let bottleneckOpponentIndex = -1;
    let bottleneckScore = Infinity;
    let bottleneckRosterIndex = -1;

    for (const opponentIndex of remainingOpponentIndices) {
      let bestScoreForThisOpponent = -Infinity;
      let bestRosterIndexForThisOpponent = -1;

      for (let rosterIndex = 0; rosterIndex < roster.length; rosterIndex++) {
        if (usedRosterIndices.has(rosterIndex)) continue;
        const cell = scoreMatrix[rosterIndex][opponentIndex];
        if (cell !== null && cell.score > bestScoreForThisOpponent) {
          bestScoreForThisOpponent = cell.score;
          bestRosterIndexForThisOpponent = rosterIndex;
        }
      }

      if (bestRosterIndexForThisOpponent === -1) {
        // Every roster Pokémon that could once score this opponent is
        // now used up by other assignments.
        uncoveredOpponents.push({
          species: opponents[opponentIndex].species,
          position: opponents[opponentIndex].position,
          reason: "roster too small to cover every opponent",
        });
        remainingOpponentIndices.delete(opponentIndex);
        continue;
      }

      if (bestScoreForThisOpponent < bottleneckScore) {
        bottleneckScore = bestScoreForThisOpponent;
        bottleneckOpponentIndex = opponentIndex;
        bottleneckRosterIndex = bestRosterIndexForThisOpponent;
      }
    }

    if (bottleneckOpponentIndex === -1) break; // everything remaining just got marked uncovered this pass

    const opponent = opponents[bottleneckOpponentIndex];
    const rosterPokemon = roster[bottleneckRosterIndex];
    const cell = scoreMatrix[bottleneckRosterIndex][bottleneckOpponentIndex]!;

    assignments.push({
      opponent: { species: opponent.species, position: opponent.position },
      rosterPokemonId: rosterPokemon.id,
      species: rosterPokemon.species,
      move: cell.move,
      summary: cell,
    });

    usedRosterIndices.add(bottleneckRosterIndex);
    remainingOpponentIndices.delete(bottleneckOpponentIndex);
  }

  return { assignments, uncoveredOpponents };
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run (from `web/`): `npm test`
Expected: PASS — all new tests, plus every prior test, pass.

- [ ] **Step 5: Run the typecheck**

Run (from `web/`): `npx tsc --noEmit`
Expected: clean, no errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/core/recommendation.ts web/src/core/recommendation.test.ts
git commit -m "Add matchup scoring and bottleneck-first team assembly"
```

---

### Task 4: `getTeamRecommendationAction` Server Action

**Files:**
- Test: `web/src/app/[game]/[gym]/[encounterId]/actions.test.ts`
- Create: `web/src/app/[game]/[gym]/[encounterId]/actions.ts`

**Interfaces:**
- Consumes: `getGameGeneration`, `getEncounterTeam` from `@/core/queries`; `listRoster` from `@/core/rosterQueries`; `evaluateNormalizedMatchup` from `@/core/matchupEngines` (Task 2); `scoreMatchup`, `assembleTeam`, `MatchupScore`, `AssembledTeam` from `@/core/recommendation` (Task 3); `RosterPokemon`, `EncounterPokemon` from `@/core/types`.
- Produces: `interface TeamRecommendation`, `getTeamRecommendationAction(gameName: string, encounterId: number): Promise<TeamRecommendation | null>`.

- [ ] **Step 1: Write the failing test file** — `web/src/app/[game]/[gym]/[encounterId]/actions.test.ts`

This test mocks the query layer and the battle-engine adapter, but uses the REAL `scoreMatchup`/`assembleTeam` from Task 3 — this is what proves the action's wiring is correct, not just that each piece works in isolation.

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTeamRecommendationAction } from "./actions";
import { getGameGeneration, getEncounterTeam } from "@/core/queries";
import { listRoster } from "@/core/rosterQueries";
import { evaluateNormalizedMatchup } from "@/core/matchupEngines";
import type { RosterPokemon, EncounterTeam } from "@/core/types";

vi.mock("@/core/queries", () => ({
  getGameGeneration: vi.fn(),
  getEncounterTeam: vi.fn(),
}));
vi.mock("@/core/rosterQueries", () => ({ listRoster: vi.fn() }));
vi.mock("@/core/matchupEngines", () => ({ evaluateNormalizedMatchup: vi.fn() }));

const mockedGetGameGeneration = vi.mocked(getGameGeneration);
const mockedGetEncounterTeam = vi.mocked(getEncounterTeam);
const mockedListRoster = vi.mocked(listRoster);
const mockedEvaluateNormalizedMatchup = vi.mocked(evaluateNormalizedMatchup);

const zeroStats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

const pikachu: RosterPokemon = {
  id: 5,
  game: "Red",
  species: "Pikachu",
  level: 50,
  nature: "Hardy",
  ability: "Static",
  ivs: zeroStats,
  evs: zeroStats,
  moves: ["Thunderbolt"],
};

const oneOpponentTeam: EncounterTeam = {
  encounter: { id: 1, gameId: 1, gymId: 1, leaderId: 1, leaderName: "Brock", variant: null },
  pokemon: [
    {
      id: 1,
      position: 1,
      species: "Onix",
      level: 20,
      gender: null,
      heldItem: null,
      dynamax: null,
      moves: ["Rock Throw"],
    },
  ],
};

describe("getTeamRecommendationAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when the game isn't found", async () => {
    mockedGetGameGeneration.mockReturnValue(null);

    const result = await getTeamRecommendationAction("NotAGame", 1);

    expect(result).toBeNull();
  });

  it("returns null when the encounter isn't found", async () => {
    mockedGetGameGeneration.mockReturnValue(1);
    mockedGetEncounterTeam.mockReturnValue(null);

    const result = await getTeamRecommendationAction("Red", 999);

    expect(result).toBeNull();
  });

  it("computes an exact recommendation for a single roster Pokémon vs a single opponent", async () => {
    mockedGetGameGeneration.mockReturnValue(1);
    mockedGetEncounterTeam.mockReturnValue(oneOpponentTeam);
    mockedListRoster.mockReturnValue([pikachu]);

    mockedEvaluateNormalizedMatchup.mockImplementation(async (_generation, attacker) => {
      if (attacker.species === "Pikachu") {
        // My Thunderbolt vs their Onix.
        return { hitsToKO: { min: 2, max: 3 }, movesFirst: "attacker" };
      }
      // Their Rock Throw vs my Pikachu.
      return { hitsToKO: { min: 5, max: 6 }, movesFirst: "defender" };
    });

    const result = await getTeamRecommendationAction("Red", 1);

    expect(result).not.toBeNull();
    expect(result!.excludedRosterPokemon).toEqual([]);
    expect(result!.uncoveredOpponents).toEqual([]);
    expect(result!.assignments).toEqual([
      {
        opponent: { species: "Onix", position: 1 },
        rosterPokemonId: 5,
        species: "Pikachu",
        move: "Thunderbolt",
        summary: {
          // theirAvg=5.5, myAvg=2.5, speedBonus=0.5 -> score=3.5
          score: 3.5,
          move: "Thunderbolt",
          myHitsToKO: { min: 2, max: 3 },
          theirHitsToKoTaken: { min: 5, max: 6 },
          movesFirst: "attacker",
        },
      },
    ]);
  });

  it("excludes a roster Pokémon with no moves selected, without blocking the rest of the roster", async () => {
    mockedGetGameGeneration.mockReturnValue(1);
    mockedGetEncounterTeam.mockReturnValue(oneOpponentTeam);
    mockedListRoster.mockReturnValue([
      { ...pikachu, id: 6, species: "Magikarp", moves: [] },
      pikachu,
    ]);
    mockedEvaluateNormalizedMatchup.mockImplementation(async (_generation, attacker) =>
      attacker.species === "Pikachu"
        ? { hitsToKO: { min: 2, max: 3 }, movesFirst: "attacker" }
        : { hitsToKO: { min: 5, max: 6 }, movesFirst: "defender" }
    );

    const result = await getTeamRecommendationAction("Red", 1);

    expect(result!.excludedRosterPokemon).toEqual([
      { id: 6, species: "Magikarp", reason: "no moves selected" },
    ]);
    expect(result!.assignments).toHaveLength(1);
    expect(result!.assignments[0].species).toBe("Pikachu");
  });

  it("returns an empty-state recommendation when the roster has no usable Pokémon", async () => {
    mockedGetGameGeneration.mockReturnValue(1);
    mockedGetEncounterTeam.mockReturnValue(oneOpponentTeam);
    mockedListRoster.mockReturnValue([]);

    const result = await getTeamRecommendationAction("Red", 1);

    expect(result!.assignments).toEqual([]);
    expect(result!.uncoveredOpponents).toEqual([
      { species: "Onix", position: 1, reason: "no roster Pokémon available" },
    ]);
    expect(mockedEvaluateNormalizedMatchup).not.toHaveBeenCalled();
  });

  it("excludes an opponent with no level data from scoring entirely", async () => {
    mockedGetGameGeneration.mockReturnValue(1);
    mockedGetEncounterTeam.mockReturnValue({
      ...oneOpponentTeam,
      pokemon: [{ ...oneOpponentTeam.pokemon[0], level: null }],
    });
    mockedListRoster.mockReturnValue([pikachu]);

    const result = await getTeamRecommendationAction("Red", 1);

    expect(result!.assignments).toEqual([]);
    expect(result!.uncoveredOpponents).toEqual([
      { species: "Onix", position: 1, reason: "no level data for this opponent" },
    ]);
    expect(mockedEvaluateNormalizedMatchup).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run (from `web/`): `npm test -- src/app/\[game\]/\[gym\]/\[encounterId\]/actions.test.ts`
Expected: FAIL — `Cannot find module './actions'`.

- [ ] **Step 3: Create `web/src/app/[game]/[gym]/[encounterId]/actions.ts`**

```ts
"use server";

import { getGameGeneration, getEncounterTeam } from "@/core/queries";
import { listRoster } from "@/core/rosterQueries";
import { evaluateNormalizedMatchup } from "@/core/matchupEngines";
import { scoreMatchup, assembleTeam, type MatchupScore, type AssembledTeam } from "@/core/recommendation";
import type { RosterPokemon, EncounterPokemon } from "@/core/types";

export interface TeamRecommendation extends AssembledTeam {
  excludedRosterPokemon: { id: number; species: string; reason: string }[];
}

const PERFECT_IVS = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const ZERO_EVS = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const NEUTRAL_NATURE = "Hardy";

export async function getTeamRecommendationAction(
  gameName: string,
  encounterId: number
): Promise<TeamRecommendation | null> {
  const generation = getGameGeneration(gameName);
  if (generation === null) return null;

  const team = getEncounterTeam(encounterId);
  if (!team) return null;

  const fullRoster = listRoster(gameName);

  const excludedRosterPokemon: { id: number; species: string; reason: string }[] = [];
  const usableRoster: RosterPokemon[] = [];
  for (const p of fullRoster) {
    if (p.moves.length === 0) {
      excludedRosterPokemon.push({ id: p.id, species: p.species, reason: "no moves selected" });
    } else {
      usableRoster.push(p);
    }
  }

  const preUncoveredOpponents: { species: string; position: number; reason: string }[] = [];
  const scoreableOpponents: EncounterPokemon[] = [];
  for (const p of team.pokemon) {
    if (p.level === null) {
      preUncoveredOpponents.push({
        species: p.species,
        position: p.position,
        reason: "no level data for this opponent",
      });
    } else {
      scoreableOpponents.push(p);
    }
  }

  if (usableRoster.length === 0) {
    return {
      assignments: [],
      uncoveredOpponents: [
        ...preUncoveredOpponents,
        ...scoreableOpponents.map((p) => ({
          species: p.species,
          position: p.position,
          reason: "no roster Pokémon available",
        })),
      ],
      excludedRosterPokemon,
    };
  }

  const scoreMatrix: (MatchupScore | null)[][] = [];

  for (const rosterPokemon of usableRoster) {
    const row: (MatchupScore | null)[] = [];

    for (const opponent of scoreableOpponents) {
      const opponentLevel = opponent.level!; // non-null: filtered above

      const theirResults = await Promise.all(
        opponent.moves.map((move) =>
          evaluateNormalizedMatchup(
            generation,
            {
              species: opponent.species,
              level: opponentLevel,
              ivs: PERFECT_IVS,
              evs: ZERO_EVS,
              nature: NEUTRAL_NATURE,
            },
            move,
            { species: rosterPokemon.species, level: rosterPokemon.level }
          )
        )
      );
      const theirMatchups = theirResults.filter((r) => r !== null);

      const myResults = await Promise.all(
        rosterPokemon.moves.map(async (move) => {
          const result = await evaluateNormalizedMatchup(
            generation,
            {
              species: rosterPokemon.species,
              level: rosterPokemon.level,
              ivs: rosterPokemon.ivs,
              evs: rosterPokemon.evs,
              nature: rosterPokemon.nature,
            },
            move,
            { species: opponent.species, level: opponentLevel }
          );
          return result ? { move, result } : null;
        })
      );
      const myMatchups = myResults.filter(
        (r): r is { move: string; result: NonNullable<(typeof myResults)[number]>["result"] } =>
          r !== null
      );

      row.push(scoreMatchup(myMatchups, theirMatchups));
    }

    scoreMatrix.push(row);
  }

  const assembled = assembleTeam(scoreMatrix, usableRoster, scoreableOpponents);

  return {
    assignments: assembled.assignments,
    uncoveredOpponents: [...preUncoveredOpponents, ...assembled.uncoveredOpponents],
    excludedRosterPokemon,
  };
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run (from `web/`): `npm test`
Expected: PASS — all new tests, plus every prior test, pass.

- [ ] **Step 5: Run the typecheck**

Run (from `web/`): `npx tsc --noEmit`
Expected: clean, no errors.

- [ ] **Step 6: Commit**

```bash
git add "web/src/app/[game]/[gym]/[encounterId]/actions.ts" "web/src/app/[game]/[gym]/[encounterId]/actions.test.ts"
git commit -m "Add getTeamRecommendationAction Server Action"
```

---

### Task 5: "Recommend team" UI

**Files:**
- Create: `web/src/app/[game]/[gym]/[encounterId]/RecommendTeamButton.tsx`
- Modify: `web/src/app/[game]/[gym]/[encounterId]/page.tsx`

**Interfaces:**
- Consumes: `getTeamRecommendationAction`, `TeamRecommendation` from `./actions` (Task 4).
- Produces: a `RecommendTeamButton` Client Component rendered from the existing `EncounterPage` Server Component.

This task has no automated test — it's UI wiring on top of already-tested logic (Tasks 3-4's scoring/assembly are unit-tested; Task 4's action is integration-tested). It's verified manually in the browser per Step 5 below, matching every prior UI-touching phase's test plan (Phase 1's route pages, Phase 2's roster form).

- [ ] **Step 1: Create `web/src/app/[game]/[gym]/[encounterId]/RecommendTeamButton.tsx`**

```tsx
"use client";

import { useState } from "react";
import { getTeamRecommendationAction, type TeamRecommendation } from "./actions";

export default function RecommendTeamButton({
  gameName,
  encounterId,
}: {
  gameName: string;
  encounterId: number;
}) {
  const [recommendation, setRecommendation] = useState<TeamRecommendation | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    const result = await getTeamRecommendationAction(gameName, encounterId);
    setRecommendation(result);
    setLoading(false);
  }

  function describeSpeed(movesFirst: "attacker" | "defender" | "tie"): string {
    if (movesFirst === "attacker") return "you go first";
    if (movesFirst === "tie") return "speed tie";
    return "they go first";
  }

  return (
    <section>
      <button onClick={handleClick} disabled={loading}>
        {loading ? "Computing..." : "Recommend team"}
      </button>

      {recommendation && (
        <div>
          {recommendation.assignments.length === 0 && (
            <p>Add Pokémon with moves to your roster to get a recommendation.</p>
          )}

          {recommendation.assignments.length > 0 && (
            <ul>
              {recommendation.assignments.map((a) => (
                <li key={a.opponent.position}>
                  vs {a.opponent.species}: bring {a.species} using {a.move} —{" "}
                  {describeSpeed(a.summary.movesFirst)}, {a.summary.myHitsToKO.min}-
                  {a.summary.myHitsToKO.max} hits to KO them, they&apos;d need{" "}
                  {a.summary.theirHitsToKoTaken.min}-{a.summary.theirHitsToKoTaken.max}
                </li>
              ))}
            </ul>
          )}

          {recommendation.uncoveredOpponents.length > 0 && (
            <div>
              <h3>Not covered</h3>
              <ul>
                {recommendation.uncoveredOpponents.map((o) => (
                  <li key={o.position}>
                    {o.species} — {o.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {recommendation.excludedRosterPokemon.length > 0 && (
            <div>
              <h3>Excluded from consideration</h3>
              <ul>
                {recommendation.excludedRosterPokemon.map((p) => (
                  <li key={p.id}>
                    {p.species} — {p.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Add the button to `web/src/app/[game]/[gym]/[encounterId]/page.tsx`**

Add this import near the top of the file, alongside the existing imports:

```ts
import RecommendTeamButton from "./RecommendTeamButton";
```

Add `<RecommendTeamButton gameName={gameName} encounterId={team.encounter.id} />` inside the `<main>` element, after the closing `</ul>` and before the closing `</main>` tag. The full return statement becomes:

```tsx
  return (
    <main>
      <h1>
        {team.encounter.leaderName}
        {team.encounter.variant ? ` — ${team.encounter.variant}` : ""}
      </h1>
      <ul>
        {enriched.map((p) => (
          <li key={p.id}>
            <h2>
              {p.species}
              {p.gender && p.gender !== "N/A" ? ` (${p.gender})` : ""}
            </h2>
            {p.level !== null && <p>Level {p.level}</p>}
            {p.info && <p>Type: {p.info.types.join(", ")}</p>}
            {p.info && <p>Abilities: {p.info.abilities.join(", ")}</p>}
            <p>Moves: {p.moves.join(", ")}</p>
            {p.heldItem && <p>Held item: {p.heldItem}</p>}
            {p.dynamax && <p>Dynamax: {p.dynamax}</p>}
          </li>
        ))}
      </ul>
      <RecommendTeamButton gameName={gameName} encounterId={team.encounter.id} />
    </main>
  );
```

- [ ] **Step 3: Run the full test suite to confirm nothing broke**

Run (from `web/`): `npm test`
Expected: PASS — every test still passes (this task added no new automated tests).

- [ ] **Step 4: Run the typecheck**

Run (from `web/`): `npx tsc --noEmit`
Expected: clean, no errors.

- [ ] **Step 5: Manual browser verification**

Start the dev server (`npm run dev` from `web/`), then in a browser:

1. Navigate to an encounter page for a game/gym that has roster Pokémon with moves selected for that game (e.g. add a Pikachu with Thunderbolt to a Red roster first, via the existing `/Red/roster` page, if none exists yet).
2. Click "Recommend team." Confirm it shows a loading state, then a sensible recommendation — one line per gym Pokémon, a roster Pokémon + move assigned, a plausible outcome summary.
3. Test the empty-roster edge case: view an encounter for a game with no roster Pokémon (or an empty roster). Confirm the "add Pokémon with moves..." message appears instead of a broken/empty list.
4. Test a roster smaller than the gym's team (e.g. one roster Pokémon vs. a two-Pokémon gym team). Confirm one opponent gets a real assignment and the other appears under "Not covered" with a sensible reason, not silently dropped.

- [ ] **Step 6: Commit**

```bash
git add "web/src/app/[game]/[gym]/[encounterId]/RecommendTeamButton.tsx" "web/src/app/[game]/[gym]/[encounterId]/page.tsx"
git commit -m "Add Recommend team button and result display to the encounter page"
```

---

## Self-Review Notes

- **Spec coverage:** the normalizing adapter (Task 2, with explicit dispatch tests per generation and null-propagation), the scoring formula (Task 3, with the Infinity-sentinel clamp and double-immunity case explicitly tested), the bottleneck-first team assembly (Task 3, with the exact naive-vs-bottleneck divergence case the spec called for), the Server Action wiring (Task 4, using real scoring/assembly logic against mocked queries/engine calls — proving integration, not just unit correctness), and the UI (Task 5, manually verified per the spec's own testing section) are all covered. The spec's exclusions (item/ability/EV recommendations, multi-battle planning, saved recommendations) are correctly absent from every task.
- **Placeholder scan:** none — every step has full file contents or an exact command with an exact expected result.
- **Type consistency:** `NormalizedMatchup` (Task 2) is consumed identically by `recommendation.ts`'s `scoreMatchup` (Task 3) and by `actions.ts`'s two `evaluateNormalizedMatchup` call sites (Task 4). `MatchupScore`/`AssembledTeam` (Task 3) are consumed identically by `actions.ts`'s `scoreMatchup`/`assembleTeam` calls and re-exported as part of `TeamRecommendation` (Task 4). `TeamRecommendation` (Task 4) is consumed identically by `RecommendTeamButton.tsx` (Task 5). The `MatchupDefenderInput.level: number` (non-nullable) constraint from Task 2 is respected in Task 4 — every call site narrows `opponent.level` via the `opponentLevel = opponent.level!` pattern only after the null-level partition has already happened, matching the spec's explicit "push the null-check to compile time" design note.
- **Formula accuracy:** every `scoreMatchup`/`assembleTeam` test case in Task 3 was computed by hand during this plan's writing (the average-plus-speed-bonus arithmetic, the best-of-my-moves selection, the worst-case-of-their-moves selection, the Infinity clamp, and the full bottleneck-first coverage scenario tracing through the exact same reasoning the spec itself walked through). Task 4's integration test reuses these same hand-computed values end-to-end (score 3.5 for the Pikachu/Onix example) rather than inventing fresh numbers, so any drift between the unit-level and integration-level expectations would be immediately visible as a test failure, not silently accepted.
