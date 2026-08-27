# Phase 3d: Battle Engine (Gen 4-5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A framework-free `evaluateGen45Matchup` orchestrator implementing Gen 4 and Gen 5's shared mechanics — a single ruleset, since these two eras are mechanically identical for this app's purposes (per-move category, the modern IV/EV/nature stat system, a 2x post-hoc critical multiplier on Gen 2-3's exact stage-based crit table, and Gen 2-3's exact 17-type chart) — with `generation: 4 | 5` used only to select the correct historically-accurate species typing.

**Architecture:** One small bounded refactor to already-shipped Phase 3c code (widening `gen23Crit.ts`'s `getGen23CritChance` signature from `2 | 3` to `2 | 3 | 4 | 5` — a type-signature-only change, since the existing logic already routes every non-2 generation to the shared Gen 3 table). Then two new modules: a damage formula (`gen45Damage.ts`, reusing `gen23TypeChart.ts`'s chart directly and reading category from `MoveData.category` rather than any type-based table) and the orchestrator (`gen45Matchup.ts`, reusing Phase 3a's `calculateStats` directly — no stat-system branching needed, unlike Gen 2-3).

**Tech Stack:** TypeScript, Vitest. Builds directly on Phase 3a's, Phase 3b's, and Phase 3c's modules.

**Spec:** [docs/superpowers/specs/2026-08-24-phase3d-battle-engine-gen4-5-design.md](../specs/2026-08-24-phase3d-battle-engine-gen4-5-design.md)

## Global Constraints

- This plan covers **only** Gen 4 and Gen 5, treated as one uniform ruleset — there is no generation-branching orchestrator logic anywhere in this plan except the single `getHistoricalTypes(species, generation)` call, since Gen 4 and Gen 5 do not mechanically differ for any of this plan's formulas.
- No status conditions, weather, held items, or abilities — same as every prior battle-engine phase, no data exists for any of this.
- Every new/modified `core/` module has zero Next.js/React imports.
- **Move category is per-move again** (`MoveData.category` directly) — unlike Gen 2-3's type-based table, Gen 4-5 uses the modern per-move system. Do NOT import or reuse `gen23Category.ts` anywhere in this plan.
- **The type chart is reused directly, unchanged**: `gen45Damage.ts` imports `getGen23TypeEffectiveness` from the existing `gen23TypeChart.ts` — no new type-chart module. Gen 2-5 all share the same 17-type chart (Steel resists Ghost/Dark; no Fairy).
- **The critical-hit multiplier is a post-hoc x2** (matching Gen 2-3, not folded into the level term like Gen 1, not 1.5x like modern Gen 6-9).
- **The damage formula has a 1-HP minimum floor** for any non-immune hit (matching Gen 2-3 and modern, unlike Gen 1). A true type immunity (`typeEffectiveness === 0`) stays `{min: 0, max: 0}`, un-floored.
- **Nature is genuinely applied** (unlike Gen 2's branch in Phase 3c) — `Gen45MatchupAttacker.nature` is a nature name (`string`), looked up via `NATURES.find()`, matching `matchup.ts`'s and `gen23Matchup.ts`'s existing convention; returns `null` if the name doesn't match any known nature.

---

### Task 1: Generalize `gen23Crit.ts`'s signature to cover Gen 4 and Gen 5

**Files:**
- Modify: `web/src/core/gen23Crit.ts`
- Modify: `web/src/core/gen23Crit.test.ts`

**Interfaces:**
- Produces: `getGen23CritChance(generation: 2 | 3 | 4 | 5, highCritRate: boolean): number` (widened signature; the existing Gen 2/Gen 3 behavior is completely unchanged — this is a pure type-signature widening, not a logic change).

This is a pure refactor: the function body's `generation === 2 ? GEN2_STAGE_CHANCES : GEN3_STAGE_CHANCES` (and the matching `generation === 2 ? 2 : 1` stage-increment ternary) already routes every value that isn't literally `2` to the Gen 3 table — which is exactly correct for `3`, `4`, and `5` alike, since Gen 3/4/5 share one stage table and one stage-increment rule (independently verified against a live source during this plan's spec-writing). No logic inside the function needs to change at all.

- [ ] **Step 1: Write the new failing tests in `gen23Crit.test.ts`**

Add these two new `it` blocks at the end of the existing `describe("getGen23CritChance", ...)` block (do not modify any existing test):

```ts
  it("Gen 3, Gen 4, and Gen 5 all return identical values (they share one table), for both highCritRate states", () => {
    expect(getGen23CritChance(3, false)).toBe(getGen23CritChance(4, false));
    expect(getGen23CritChance(4, false)).toBe(getGen23CritChance(5, false));
    expect(getGen23CritChance(3, true)).toBe(getGen23CritChance(4, true));
    expect(getGen23CritChance(4, true)).toBe(getGen23CritChance(5, true));
  });

  it("Gen 4 and Gen 5 values match the known Gen 3 constants exactly", () => {
    expect(getGen23CritChance(4, false)).toBeCloseTo(1 / 16);
    expect(getGen23CritChance(5, false)).toBeCloseTo(1 / 16);
    expect(getGen23CritChance(4, true)).toBeCloseTo(1 / 8);
    expect(getGen23CritChance(5, true)).toBeCloseTo(1 / 8);
  });
```

- [ ] **Step 2: Run the new tests and verify they fail**

Run (from `web/`): `npm test -- src/core/gen23Crit.test.ts`
Expected: FAIL — TypeScript will reject `getGen23CritChance(4, ...)` and `getGen23CritChance(5, ...)` as invalid arguments, since the current signature only accepts `2 | 3`.

- [ ] **Step 3: Widen the signature in `web/src/core/gen23Crit.ts`**

Find this line:

```ts
export function getGen23CritChance(
  generation: 2 | 3,
  highCritRate: boolean
): number {
```

Change ONLY the type annotation on `generation` — nothing else in the function changes:

```ts
export function getGen23CritChance(
  generation: 2 | 3 | 4 | 5,
  highCritRate: boolean
): number {
```

The function body below this line (the `stages`/`stageIncrement`/`stage`/`clampedStage` logic) stays completely unchanged.

- [ ] **Step 4: Run all tests and verify they pass**

Run (from `web/`): `npm test`
Expected: PASS — new tests pass, all existing `gen23Crit.test.ts` tests unchanged and passing, `gen23Matchup.test.ts` passes completely unchanged (its `generation: 2 | 3` calls still satisfy the widened `2 | 3 | 4 | 5` parameter type — a narrower argument type is always assignable to a wider parameter type).

- [ ] **Step 5: Run the typecheck**

Run (from `web/`): `npx tsc --noEmit`
Expected: clean, no errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/core/gen23Crit.ts web/src/core/gen23Crit.test.ts
git commit -m "Widen getGen23CritChance to accept generation 4 and 5 (same table as Gen 3)"
```

---

### Task 2: Gen 4-5 damage formula

**Files:**
- Test: `web/src/core/gen45Damage.test.ts`
- Create: `web/src/core/gen45Damage.ts`

**Interfaces:**
- Consumes: `getGen23TypeEffectiveness` from `./gen23TypeChart` (existing, Phase 3c); `StatBlock`, `MoveData` from `./types`.
- Produces: `interface DamageRange { min: number; max: number }`, `calculateGen45DamageRange(attackerLevel: number, attackerStats: StatBlock, defenderStats: StatBlock, move: MoveData, attackerTypes: string[], defenderTypes: string[], critical: boolean): DamageRange | null`.

- [ ] **Step 1: Write the failing test file** — `web/src/core/gen45Damage.test.ts`

Every expected value is hand-computed from the formula
(`base = floor(floor(floor(2*Level/5+2) * Power * Atk/Def) / 50) + 2`,
`damage = floor(base * STAB * TypeEff * CritMultiplier * RandomFactor)`
with `RandomFactor` approximated as `0.85`-`1.0`, and a 1-HP minimum floor
for any non-immune hit) — see the spec for the worked arithmetic. These
values are identical to `gen23Damage.ts`'s test fixtures (same formula
shape, same inputs), since this module differs from `gen23Damage.ts` only
in reading `move.category` directly instead of deriving it from type.

```ts
import { describe, it, expect } from "vitest";
import { calculateGen45DamageRange } from "./gen45Damage";
import type { MoveData } from "./types";

const attackerStats = { hp: 150, atk: 100, def: 80, spa: 70, spd: 80, spe: 90 };
const defenderStats = { hp: 150, atk: 80, def: 100, spa: 80, spd: 100, spe: 70 };

describe("calculateGen45DamageRange", () => {
  it("computes a STAB, type-neutral physical move, non-crit", () => {
    const move: MoveData = {
      name: "tackle",
      type: "normal",
      category: "physical",
      power: 80,
      priority: 0,
      highCritRate: false,
    };
    const result = calculateGen45DamageRange(50, attackerStats, defenderStats, move, ["normal"], ["fighting"], false);
    expect(result).toEqual({ min: 47, max: 55 });
  });

  it("applies the critical multiplier as a post-hoc x2 on the base term, NOT by changing the level term (unlike Gen 1)", () => {
    const move: MoveData = {
      name: "tackle",
      type: "normal",
      category: "physical",
      power: 80,
      priority: 0,
      highCritRate: false,
    };
    const result = calculateGen45DamageRange(50, attackerStats, defenderStats, move, ["normal"], ["fighting"], true);
    expect(result).toEqual({ min: 94, max: 111 });
  });

  it("uses the special attack/defense stats for a special-category move, non-STAB, super-effective", () => {
    const move: MoveData = {
      name: "ember",
      type: "fire",
      category: "special",
      power: 80,
      priority: 0,
      highCritRate: false,
    };
    const result = calculateGen45DamageRange(50, attackerStats, defenderStats, move, ["water"], ["grass"], false);
    expect(result).toEqual({ min: 44, max: 52 });
  });

  it("returns null for a status move", () => {
    const move: MoveData = {
      name: "growl",
      type: "normal",
      category: "status",
      power: null,
      priority: 0,
      highCritRate: false,
    };
    const result = calculateGen45DamageRange(50, attackerStats, defenderStats, move, ["normal"], ["normal"], false);
    expect(result).toBeNull();
  });

  it("returns a genuine {min:0,max:0} for a true type immunity, NOT floored to 1", () => {
    const move: MoveData = {
      name: "tackle",
      type: "normal",
      category: "physical",
      power: 40,
      priority: 0,
      highCritRate: false,
    };
    const result = calculateGen45DamageRange(50, attackerStats, defenderStats, move, ["water"], ["ghost"], false);
    expect(result).toEqual({ min: 0, max: 0 });
  });

  it("applies a 1-HP minimum-damage floor for a non-immune hit that would otherwise round to 0 (unlike Gen 1, which has no floor)", () => {
    const lowStatsAttacker = { hp: 20, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 };
    const lowStatsDefender = { hp: 20, atk: 1, def: 1, spa: 255, spd: 255, spe: 1 };
    const move: MoveData = {
      name: "bubble",
      type: "water",
      category: "special",
      power: 1,
      priority: 0,
      highCritRate: false,
    };
    const result = calculateGen45DamageRange(1, lowStatsAttacker, lowStatsDefender, move, ["normal"], ["grass"], false);
    expect(result).toEqual({ min: 1, max: 1 });
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run (from `web/`): `npm test -- src/core/gen45Damage.test.ts`
Expected: FAIL — `Cannot find module './gen45Damage'`.

- [ ] **Step 3: Create `web/src/core/gen45Damage.ts`**

```ts
import { getGen23TypeEffectiveness } from "./gen23TypeChart";
import type { StatBlock, MoveData } from "./types";

export interface DamageRange {
  min: number;
  max: number;
}

export function calculateGen45DamageRange(
  attackerLevel: number,
  attackerStats: StatBlock,
  defenderStats: StatBlock,
  move: MoveData,
  attackerTypes: string[],
  defenderTypes: string[],
  critical: boolean
): DamageRange | null {
  if (move.category === "status" || move.power === null) {
    return null;
  }

  const atk = move.category === "physical" ? attackerStats.atk : attackerStats.spa;
  const def = move.category === "physical" ? defenderStats.def : defenderStats.spd;

  const base =
    Math.floor(
      Math.floor(Math.floor((2 * attackerLevel) / 5 + 2) * move.power * (atk / def)) / 50
    ) + 2;

  const stab = attackerTypes.includes(move.type) ? 1.5 : 1;

  const typeEffectiveness = defenderTypes.reduce(
    (product, defType) => product * getGen23TypeEffectiveness(move.type, defType),
    1
  );

  const criticalMultiplier = critical ? 2 : 1;

  const min = Math.floor(base * stab * typeEffectiveness * criticalMultiplier * 0.85);
  const max = Math.floor(base * stab * typeEffectiveness * criticalMultiplier * 1.0);

  // A non-immune hit is guaranteed at least 1 HP of damage (unlike Gen 1,
  // which has no floor). A true type immunity must stay {min: 0, max: 0}
  // so hitsToKO can still resolve to Infinity for genuinely impossible KOs.
  const clampedMin = typeEffectiveness > 0 ? Math.max(1, min) : min;
  const clampedMax = typeEffectiveness > 0 ? Math.max(1, max) : max;

  return { min: clampedMin, max: clampedMax };
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run (from `web/`): `npm test`
Expected: PASS — all 6 new tests, plus every prior test, pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/core/gen45Damage.ts web/src/core/gen45Damage.test.ts
git commit -m "Add Gen 4-5 damage formula (per-move category, post-hoc crit, 1-HP floor)"
```

---

### Task 3: Gen 4-5 matchup evaluator (orchestrator)

**Files:**
- Test: `web/src/core/gen45Matchup.test.ts`
- Create: `web/src/core/gen45Matchup.ts`

**Interfaces:**
- Consumes: `getHistoricalTypes` from `./gen1Types` (Phase 3c, Task 1); `getBaseStats` from `./baseStats` (Phase 3a); `getMoveData` from `./moveData` (Phase 3a); `calculateStats` from `./stats` (Phase 3a); `calculateGen45DamageRange` from `./gen45Damage` (Task 2); `getGen23CritChance` from `./gen23Crit` (Task 1 of this plan); `NATURES` from `./natures` (Phase 3a); `StatBlock`, `MoveData` from `./types`.
- Produces: `interface Gen45MatchupInput`, `interface Gen45MatchupResult`, `evaluateGen45Matchup(input: Gen45MatchupInput): Promise<Gen45MatchupResult | null>` — the module a later phase will call directly.

- [ ] **Step 1: Write the failing test file** — `web/src/core/gen45Matchup.test.ts`

The first "exact hand-verified matchup result" test is hand-computed by
chaining the modern stat formula (Phase 3a's `calculateStats`, WITH a
genuinely-applied Modest nature) with Task 1's crit formula and Task 2's
damage formula — see the spec for the worked arithmetic. The second test
specifically proves the `generation` field reaches the historical-typing
lookup (not silently ignored or hardcoded) by mocking DIFFERENT typing
results for `generation: 4` vs `generation: 5` and confirming the damage
output genuinely diverges — directly applying the lesson from Phase 3c's
final review, which found this exact class of untested wiring.

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { evaluateGen45Matchup } from "./gen45Matchup";
import { getHistoricalTypes } from "./gen1Types";
import { getBaseStats } from "./baseStats";
import { getMoveData } from "./moveData";
import type { MoveData, StatBlock } from "./types";

vi.mock("./gen1Types", () => ({ getHistoricalTypes: vi.fn() }));
vi.mock("./baseStats", () => ({ getBaseStats: vi.fn() }));
vi.mock("./moveData", () => ({ getMoveData: vi.fn() }));

const mockedGetHistoricalTypes = vi.mocked(getHistoricalTypes);
const mockedGetBaseStats = vi.mocked(getBaseStats);
const mockedGetMoveData = vi.mocked(getMoveData);

const attackerBase: StatBlock = { hp: 45, atk: 49, def: 49, spa: 65, spd: 50, spe: 45 };
const defenderBase: StatBlock = { hp: 45, atk: 49, def: 49, spa: 65, spd: 70, spe: 90 };
const perfectIvs: StatBlock = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const zeroEvs: StatBlock = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

const psybeam: MoveData = {
  name: "psybeam",
  type: "psychic",
  category: "special",
  power: 60,
  priority: 0,
  highCritRate: false,
};

function setupMocks(overrides?: {
  attackerTypes?: string[];
  defenderTypes?: string[];
  attackerBaseStats?: StatBlock;
  defenderBaseStats?: StatBlock;
  move?: MoveData;
}) {
  const attackerTypes = overrides?.attackerTypes ?? ["grass"];
  const defenderTypes = overrides?.defenderTypes ?? ["fire"];

  mockedGetHistoricalTypes.mockImplementation(async (species: string) => {
    return species === "Attacker" ? attackerTypes : defenderTypes;
  });
  mockedGetBaseStats.mockImplementation(async (species: string) => {
    return species === "Attacker"
      ? overrides?.attackerBaseStats ?? attackerBase
      : overrides?.defenderBaseStats ?? defenderBase;
  });
  mockedGetMoveData.mockResolvedValue(overrides?.move ?? psybeam);
}

describe("evaluateGen45Matchup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computes an exact hand-verified matchup result, with a genuinely-applied nature and post-hoc crit", async () => {
    setupMocks();

    const result = await evaluateGen45Matchup({
      generation: 4,
      attacker: { species: "Attacker", level: 50, ivs: perfectIvs, evs: zeroEvs, nature: "Modest" },
      attackerMove: "Psybeam",
      defender: { species: "Defender", level: 50 },
    });

    expect(result).toEqual({
      normal: {
        damageRange: { min: 24, max: 29 },
        hitsToKO: { min: 5, max: 5 },
      },
      criticalHit: {
        chance: 1 / 16,
        damageRange: { min: 49, max: 58 },
        hitsToKO: { min: 3, max: 3 },
      },
      moveOrder: "defender",
    });
  });

  it("uses the generation field to select the correct historical typing (Gen 4 vs Gen 5 differ for this fixture, proving the field isn't ignored or hardcoded)", async () => {
    const ember: MoveData = {
      name: "ember",
      type: "fire",
      category: "special",
      power: 80,
      priority: 0,
      highCritRate: false,
    };

    mockedGetHistoricalTypes.mockImplementation(async (species: string, generation: number) => {
      if (species === "Attacker") {
        return generation === 4 ? ["fire"] : ["water"];
      }
      return ["normal"];
    });
    mockedGetBaseStats.mockImplementation(async (species: string) =>
      species === "Attacker" ? attackerBase : defenderBase
    );
    mockedGetMoveData.mockResolvedValue(ember);

    const gen4Result = await evaluateGen45Matchup({
      generation: 4,
      attacker: { species: "Attacker", level: 50, ivs: perfectIvs, evs: zeroEvs, nature: "Hardy" },
      attackerMove: "Ember",
      defender: { species: "Defender", level: 50 },
    });

    const gen5Result = await evaluateGen45Matchup({
      generation: 5,
      attacker: { species: "Attacker", level: 50, ivs: perfectIvs, evs: zeroEvs, nature: "Hardy" },
      attackerMove: "Ember",
      defender: { species: "Defender", level: 50 },
    });

    // Gen 4: attacker is Fire-type, so Ember gets STAB (1.5x). Gen 5: the
    // mock returns Water-type for the same species/generation-4 species
    // lookup, so Ember gets no STAB (1x) — a genuinely different result,
    // not a coincidence, proving `generation` reached the mock.
    expect(gen4Result!.normal.damageRange).toEqual({ min: 44, max: 52 });
    expect(gen5Result!.normal.damageRange).toEqual({ min: 29, max: 35 });
    expect(mockedGetHistoricalTypes).toHaveBeenCalledWith("Attacker", 4);
    expect(mockedGetHistoricalTypes).toHaveBeenCalledWith("Attacker", 5);
  });

  it("returns null for a status move", async () => {
    setupMocks({
      move: { name: "growl", type: "normal", category: "status", power: null, priority: 0, highCritRate: false },
    });

    const result = await evaluateGen45Matchup({
      generation: 4,
      attacker: { species: "Attacker", level: 50, ivs: perfectIvs, evs: zeroEvs, nature: "Hardy" },
      attackerMove: "Growl",
      defender: { species: "Defender", level: 50 },
    });

    expect(result).toBeNull();
  });

  it("returns null when a types lookup fails", async () => {
    mockedGetHistoricalTypes.mockResolvedValue(null);
    mockedGetBaseStats.mockResolvedValue(attackerBase);
    mockedGetMoveData.mockResolvedValue(psybeam);

    const result = await evaluateGen45Matchup({
      generation: 4,
      attacker: { species: "Attacker", level: 50, ivs: perfectIvs, evs: zeroEvs, nature: "Hardy" },
      attackerMove: "Psybeam",
      defender: { species: "Defender", level: 50 },
    });

    expect(result).toBeNull();
  });

  it("returns null when the attacker's nature name doesn't match any known nature", async () => {
    setupMocks();

    const result = await evaluateGen45Matchup({
      generation: 4,
      attacker: { species: "Attacker", level: 50, ivs: perfectIvs, evs: zeroEvs, nature: "NotARealNature" },
      attackerMove: "Psybeam",
      defender: { species: "Defender", level: 50 },
    });

    expect(result).toBeNull();
  });

  it("returns 'attacker' move order for a positive-priority move even with lower Speed", async () => {
    setupMocks({
      move: { name: "quick-attack", type: "normal", category: "physical", power: 40, priority: 1, highCritRate: false },
    });

    const result = await evaluateGen45Matchup({
      generation: 5,
      attacker: { species: "Attacker", level: 50, ivs: perfectIvs, evs: zeroEvs, nature: "Hardy" },
      attackerMove: "Quick Attack",
      defender: { species: "Defender", level: 50 },
    });

    expect(result!.moveOrder).toBe("attacker");
  });

  it("returns a zero damage range NOT floored to 1 for a true type immunity, and Infinity hitsToKO", async () => {
    setupMocks({
      attackerTypes: ["normal"],
      defenderTypes: ["ghost"],
      move: { name: "tackle", type: "normal", category: "physical", power: 40, priority: 0, highCritRate: false },
    });

    const result = await evaluateGen45Matchup({
      generation: 4,
      attacker: { species: "Attacker", level: 50, ivs: perfectIvs, evs: zeroEvs, nature: "Hardy" },
      attackerMove: "Tackle",
      defender: { species: "Defender", level: 50 },
    });

    expect(result!.normal.damageRange).toEqual({ min: 0, max: 0 });
    expect(result!.normal.hitsToKO.max).toBe(Infinity);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run (from `web/`): `npm test -- src/core/gen45Matchup.test.ts`
Expected: FAIL — `Cannot find module './gen45Matchup'`.

- [ ] **Step 3: Create `web/src/core/gen45Matchup.ts`**

```ts
import { getHistoricalTypes } from "./gen1Types";
import { getBaseStats } from "./baseStats";
import { getMoveData } from "./moveData";
import { calculateStats } from "./stats";
import { calculateGen45DamageRange } from "./gen45Damage";
import { getGen23CritChance } from "./gen23Crit";
import { NATURES } from "./natures";
import type { StatBlock, MoveData } from "./types";

/** `ivs`/`evs` use the standard 0-31/0-252 scale and are used directly —
 * Gen 4-5 natively uses the modern IV/EV/nature system, no reinterpretation
 * needed. `nature` is a nature NAME (looked up via `NATURES.find()`,
 * matching `MatchupAttacker`'s existing convention in `matchup.ts`) and is
 * genuinely applied — unlike Gen 2's branch in `gen23Matchup.ts`. */
export interface Gen45MatchupAttacker {
  species: string;
  level: number;
  ivs: StatBlock;
  evs: StatBlock;
  nature: string;
}

/** The defender is always evaluated with perfect IVs (31), zero EVs, and a
 * neutral ("Hardy") nature — a fixed convention for a trainer Pokémon with
 * no roster data, not derived from any input on this type. */
export interface Gen45MatchupDefender {
  species: string;
  level: number;
}

/** `generation` affects ONLY the historical-typing lookup
 * (`getHistoricalTypes`) — stats, crit chance, and damage are identical
 * for Gen 4 and Gen 5, since these two eras don't mechanically differ for
 * any formula this module implements. */
export interface Gen45MatchupInput {
  generation: 4 | 5;
  attacker: Gen45MatchupAttacker;
  attackerMove: string;
  defender: Gen45MatchupDefender;
}

/** `hitsToKO.min`/`.max` can be `Infinity` (e.g. a type-immune matchup)
 * despite the plain `number` type — callers serializing this (e.g.
 * `JSON.stringify`, a Server Action boundary) should be aware `Infinity`
 * serializes to `null`. */
export interface Gen45MatchupOutcome {
  damageRange: { min: number; max: number };
  hitsToKO: { min: number; max: number };
}

export interface Gen45MatchupResult {
  normal: Gen45MatchupOutcome;
  /** `chance` is a probability in [0, 1], not a percentage. */
  criticalHit: { chance: number } & Gen45MatchupOutcome;
  moveOrder: "attacker" | "defender" | "tie";
}

const PERFECT_IVS: StatBlock = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const ZERO_EVS: StatBlock = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

function outcomeFor(
  attackerLevel: number,
  attackerStats: StatBlock,
  defenderStats: StatBlock,
  move: MoveData,
  attackerTypes: string[],
  defenderTypes: string[],
  critical: boolean
): Gen45MatchupOutcome | null {
  const damageRange = calculateGen45DamageRange(
    attackerLevel,
    attackerStats,
    defenderStats,
    move,
    attackerTypes,
    defenderTypes,
    critical
  );
  if (!damageRange) return null;

  const hitsToKO = {
    min: damageRange.max > 0 ? Math.ceil(defenderStats.hp / damageRange.max) : Infinity,
    max: damageRange.min > 0 ? Math.ceil(defenderStats.hp / damageRange.min) : Infinity,
  };

  return { damageRange, hitsToKO };
}

/** Returns `null` if any species/move lookup fails, the move is a status
 * move, a species has no historically-valid typing for the target
 * generation (see `getHistoricalTypes`), or the attacker's nature name
 * doesn't match any known nature. */
export async function evaluateGen45Matchup(
  input: Gen45MatchupInput
): Promise<Gen45MatchupResult | null> {
  const { generation, attacker, attackerMove, defender } = input;

  const [attackerTypes, defenderTypes, attackerBase, defenderBase, move] = await Promise.all([
    getHistoricalTypes(attacker.species, generation),
    getHistoricalTypes(defender.species, generation),
    getBaseStats(attacker.species),
    getBaseStats(defender.species),
    getMoveData(attackerMove),
  ]);

  if (!attackerTypes || !defenderTypes || !attackerBase || !defenderBase || !move) {
    return null;
  }

  if (move.category === "status" || move.power === null) {
    return null;
  }

  const attackerNature = NATURES.find((n) => n.name === attacker.nature);
  if (!attackerNature) return null;
  const neutralNature = NATURES.find((n) => n.name === "Hardy")!;

  const attackerStats = calculateStats(
    attackerBase,
    attacker.ivs,
    attacker.evs,
    attackerNature,
    attacker.level
  );
  const defenderStats = calculateStats(defenderBase, PERFECT_IVS, ZERO_EVS, neutralNature, defender.level);

  const normal = outcomeFor(
    attacker.level,
    attackerStats,
    defenderStats,
    move,
    attackerTypes,
    defenderTypes,
    false
  );
  const critical = outcomeFor(
    attacker.level,
    attackerStats,
    defenderStats,
    move,
    attackerTypes,
    defenderTypes,
    true
  );

  if (!normal || !critical) return null;

  const critChance = getGen23CritChance(generation, move.highCritRate);

  let moveOrder: "attacker" | "defender" | "tie";
  if (move.priority > 0) {
    moveOrder = "attacker";
  } else if (move.priority < 0) {
    moveOrder = "defender";
  } else if (attackerStats.spe > defenderStats.spe) {
    moveOrder = "attacker";
  } else if (attackerStats.spe < defenderStats.spe) {
    moveOrder = "defender";
  } else {
    moveOrder = "tie";
  }

  return {
    normal,
    criticalHit: { chance: critChance, ...critical },
    moveOrder,
  };
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run (from `web/`): `npm test`
Expected: PASS — all 7 new tests, plus every prior test, pass.

- [ ] **Step 5: Run the typecheck**

Run (from `web/`): `npx tsc --noEmit`
Expected: clean, no errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/core/gen45Matchup.ts web/src/core/gen45Matchup.test.ts
git commit -m "Add Gen 4-5 matchup evaluator (single ruleset, generation only affects species typing)"
```

---

## Self-Review Notes

- **Spec coverage:** the bounded refactor (widening `getGen23CritChance`'s signature, a pure type change with a genuine equivalence test), the damage formula (per-move category, reused type chart, post-hoc crit, 1-HP floor), and the full orchestrator (no generation-branching beyond the typing lookup, genuinely-applied nature, reused defender convention) are all covered. The spec's exclusions (no further battle-engine sub-phases, no historical base-stat/move-type accuracy beyond typing, no status/weather/items/abilities, no UI integration) are correctly absent from every task.
- **Placeholder scan:** none — every step has full file contents or an exact command with an exact expected result.
- **Type consistency:** `getGen23CritChance`'s widened signature (Task 1) is consumed by `gen45Matchup.ts` (Task 3) with a `generation: 4 | 5` value, which satisfies the widened `2 | 3 | 4 | 5` parameter type. `calculateGen45DamageRange`'s 7-arg signature (Task 2) matches Task 3's two `outcomeFor` calls exactly. `Gen45MatchupAttacker.nature: string` matches `NATURES.find((n) => n.name === attacker.nature)` in Task 3 — consistent with `matchup.ts`'s and `gen23Matchup.ts`'s existing convention, not a `Nature` object.
- **Formula accuracy:** Task 2's damage fixtures reuse arithmetic already independently hand-verified twice during Phase 3c's Task 6 (implementer + reviewer), since the formula shape is identical apart from the category source — low re-verification risk. Task 3's first integration test reuses Phase 3c's Gen 3 fixture arithmetic (also independently verified) for the same reason. Task 3's second integration test is a fresh, independently-computed fixture proving the `generation` field's wiring specifically — this is new arithmetic (STAB present vs absent, changing `{min:44,max:52}` vs `{min:29,max:35}`) and was computed directly during this plan's writing, not reused from a prior phase.
