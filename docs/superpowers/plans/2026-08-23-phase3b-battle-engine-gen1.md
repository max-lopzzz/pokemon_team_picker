# Phase 3b: Battle Engine (Gen 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A framework-free `evaluateGen1Matchup` orchestrator implementing Gen 1's genuinely different mechanics — no special-stat split, no natures, a DV/Stat-Experience system, a Speed-based critical-hit mechanic that's actually modeled (unlike Phase 3a's exclusion), a 15-type chart with documented historical bugs, and no minimum-damage floor — parallel to Phase 3a's Gen 6-9 engine.

**Architecture:** One cross-cutting extension to the existing, shared `MoveData` type (`highCritRate`, needed by both eras going forward), then six new `gen1`-prefixed modules: a generated type chart (derived from Phase 3a's already-verified modern chart, not re-transcribed), a historical-type lookup (`past_types`), three pure calculators (stats, crit chance, damage), and the orchestrator. Reuses Phase 1's nothing extra and Phase 3a's `getBaseStats`/`getMoveData` unchanged — base stats and move data are generation-invariant in PokeAPI.

**Tech Stack:** TypeScript, Vitest. Builds directly on Phase 3a's modules and the `apiCache.ts` shared fetch/cache helper.

**Spec:** [docs/superpowers/specs/2026-08-23-phase3b-battle-engine-gen1-design.md](../specs/2026-08-23-phase3b-battle-engine-gen1-design.md)

## Global Constraints

- This plan covers **only** Gen 1. Gen 2-3 and Gen 4-5 are separate future phases.
- No status conditions, weather, or held items — same as Phase 3a, no data exists for any of this.
- Every new `core/` module has zero Next.js/React imports.
- The new `gen1Types.ts` PokeAPI client follows the exact same `fetchCached`/`toApiSlug` pattern as every other client in this codebase (timeout, negative-cache, no real network calls in tests).
- **Gen 1 has no minimum-damage floor** — `gen1Damage.ts` must NOT clamp to 1 the way Phase 3a's `damage.ts` does. A genuinely zero result (`{min: 0, max: 0}`) is correct Gen 1 behavior, not a bug.
- The single "Special" stat is represented by using a species' base Special Attack value for both offense and defense — this is applied by the caller (`gen1Matchup.ts`), not baked into `gen1Stats.ts` itself, which stays a generic formula over whatever `StatBlock` it's given.
- Extending the shared `MoveData` type with `highCritRate` requires updating every existing file that constructs a `MoveData` object literal (`moveData.ts`, `moveData.test.ts`, `damage.test.ts`, `matchup.test.ts` — all from Phase 3a) so the whole suite keeps compiling. This is Task 1, done first, before anything else depends on the new field.

---

### Task 1: Extend `MoveData` with `highCritRate`

**Files:**
- Modify: `web/src/core/types.ts`
- Modify: `web/src/core/moveData.ts`
- Modify: `web/src/core/moveData.test.ts`
- Modify: `web/src/core/damage.test.ts`
- Modify: `web/src/core/matchup.test.ts`

**Interfaces:**
- Produces: `MoveData.highCritRate: boolean` (new field on the existing, shared type) — every consumer of `MoveData` across the whole codebase must supply it from this task forward.

- [ ] **Step 1: Add `highCritRate` to `MoveData` in `web/src/core/types.ts`**

Find the existing `MoveData` interface and add one field:

```ts
export interface MoveData {
  name: string;
  type: string;
  category: "physical" | "special" | "status";
  power: number | null;
  priority: number;
  highCritRate: boolean;
}
```

- [ ] **Step 2: Write the failing test additions to `web/src/core/moveData.test.ts`**

Replace the entire file with:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getMoveData } from "./moveData";

function mockPokeApiMoveResponse(data: {
  type: string;
  category: "physical" | "special" | "status";
  power: number | null;
  priority: number;
  critRate?: number;
}) {
  return {
    ok: true,
    json: async () => ({
      type: { name: data.type },
      damage_class: { name: data.category },
      power: data.power,
      priority: data.priority,
      meta: { crit_rate: data.critRate ?? 0 },
    }),
  };
}

describe("getMoveData", () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "movedata-cache-"));
  });

  afterEach(async () => {
    await fs.rm(cacheDir, { recursive: true, force: true });
  });

  it("fetches and maps a physical move's data", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockPokeApiMoveResponse({ type: "normal", category: "physical", power: 40, priority: 0 })
    );

    const result = await getMoveData("Tackle", { cacheDir, fetchImpl });

    expect(result).toEqual({
      name: "Tackle",
      type: "normal",
      category: "physical",
      power: 40,
      priority: 0,
      highCritRate: false,
    });
  });

  it("maps a status move's null power", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockPokeApiMoveResponse({ type: "normal", category: "status", power: null, priority: 0 })
    );

    const result = await getMoveData("Growl", { cacheDir, fetchImpl });

    expect(result).toEqual({
      name: "Growl",
      type: "normal",
      category: "status",
      power: null,
      priority: 0,
      highCritRate: false,
    });
  });

  it("maps a priority move's priority value", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockPokeApiMoveResponse({ type: "normal", category: "physical", power: 40, priority: 1 })
    );

    const result = await getMoveData("Quick Attack", { cacheDir, fetchImpl });

    expect(result!.priority).toBe(1);
  });

  it("marks a high-crit-rate move (e.g. Slash) as highCritRate: true", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockPokeApiMoveResponse({ type: "normal", category: "physical", power: 70, priority: 0, critRate: 1 })
    );

    const result = await getMoveData("Slash", { cacheDir, fetchImpl });

    expect(result!.highCritRate).toBe(true);
  });

  it("caches the result and does not refetch on a second call", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockPokeApiMoveResponse({ type: "normal", category: "physical", power: 40, priority: 0 })
    );

    await getMoveData("Tackle", { cacheDir, fetchImpl });
    await getMoveData("Tackle", { cacheDir, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("negative-caches a failed lookup so it does not refetch", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 });

    const first = await getMoveData("NotAMove", { cacheDir, fetchImpl });
    const second = await getMoveData("NotAMove", { cacheDir, fetchImpl });

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("strips punctuation from the move name when building the request URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockPokeApiMoveResponse({ type: "steel", category: "status", power: null, priority: 0 })
    );

    await getMoveData("King's Shield", { cacheDir, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const requestedUrl = fetchImpl.mock.calls[0][0] as string;
    expect(requestedUrl).toContain("kings-shield");
    expect(requestedUrl).not.toContain("king's-shield");
    expect(requestedUrl).not.toContain("king%27s-shield");
  });

  it("returns null when the response has an unrecognized damage class", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        type: { name: "normal" },
        damage_class: { name: "not-a-real-category" },
        power: 40,
        priority: 0,
      }),
    });

    const result = await getMoveData("Weird Move", { cacheDir, fetchImpl });

    expect(result).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test and verify it fails**

Run (from `web/`): `npm test -- src/core/moveData.test.ts`
Expected: FAIL — the "highCritRate: true" test fails (current code doesn't produce that field), and the two `toEqual` assertions fail because they now expect `highCritRate: false` but the current implementation doesn't include it.

- [ ] **Step 4: Update `web/src/core/moveData.ts`**

Replace the entire file with:

```ts
import path from "node:path";
import { fetchCached, toApiSlug, type FetchCachedParams } from "./apiCache";
import type { MoveData } from "./types";

const DEFAULT_CACHE_DIR = path.join(process.cwd(), ".cache", "pokeapi-movedata");
const POKEAPI_BASE = "https://pokeapi.co/api/v2";

interface Options {
  cacheDir?: string;
  fetchImpl?: typeof fetch;
}

export async function getMoveData(
  moveName: string,
  options: Options = {}
): Promise<MoveData | null> {
  const cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;
  const fetchImpl = options.fetchImpl ?? fetch;
  const slug = toApiSlug(moveName);

  const params: FetchCachedParams<MoveData> = {
    cacheKey: slug,
    cacheDir,
    url: `${POKEAPI_BASE}/move/${encodeURIComponent(slug)}`,
    fetchImpl,
    errorLabel: `move "${moveName}"`,
    parse: (data) => {
      const d = data as {
        type?: { name: string };
        damage_class?: { name: string };
        power: number | null;
        priority: number;
        meta?: { crit_rate: number };
      };
      if (!d.type || !d.damage_class) return null;

      const category = d.damage_class.name;
      if (category !== "physical" && category !== "special" && category !== "status") {
        return null;
      }

      return {
        name: moveName,
        type: d.type.name,
        category,
        power: d.power,
        priority: d.priority,
        highCritRate: (d.meta?.crit_rate ?? 0) > 0,
      };
    },
  };

  return fetchCached<MoveData>(params);
}
```

- [ ] **Step 5: Update `web/src/core/damage.test.ts`** to add `highCritRate: false,` to every `MoveData` literal

Replace the entire file with:

```ts
import { describe, it, expect } from "vitest";
import { calculateDamageRange } from "./damage";
import type { MoveData } from "./types";

const attackerStats = { hp: 150, atk: 100, def: 80, spa: 70, spd: 80, spe: 90 };
const defenderStats = { hp: 150, atk: 80, def: 100, spa: 80, spd: 100, spe: 70 };

describe("calculateDamageRange", () => {
  it("computes a STAB, type-neutral physical move", () => {
    const move: MoveData = {
      name: "ember",
      type: "fire",
      category: "physical",
      power: 80,
      priority: 0,
      highCritRate: false,
    };
    const result = calculateDamageRange(50, attackerStats, defenderStats, move, ["fire"], ["normal"]);
    expect(result).toEqual({ min: 47, max: 55 });
  });

  it("computes a non-STAB, super-effective physical move", () => {
    const move: MoveData = {
      name: "surf",
      type: "water",
      category: "physical",
      power: 80,
      priority: 0,
      highCritRate: false,
    };
    const result = calculateDamageRange(50, attackerStats, defenderStats, move, ["grass"], ["fire"]);
    expect(result).toEqual({ min: 62, max: 74 });
  });

  it("uses the special attack/defense stats for a special move", () => {
    const move: MoveData = {
      name: "flamethrower",
      type: "fire",
      category: "special",
      power: 90,
      priority: 0,
      highCritRate: false,
    };
    const result = calculateDamageRange(50, attackerStats, defenderStats, move, ["fire"], ["normal"]);
    expect(result).toEqual({ min: 36, max: 43 });
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
    const result = calculateDamageRange(50, attackerStats, defenderStats, move, ["normal"], ["normal"]);
    expect(result).toBeNull();
  });

  it("returns a zero range for a type-immune matchup", () => {
    const move: MoveData = {
      name: "tackle",
      type: "normal",
      category: "physical",
      power: 40,
      priority: 0,
      highCritRate: false,
    };
    const result = calculateDamageRange(50, attackerStats, defenderStats, move, ["normal"], ["ghost"]);
    expect(result).toEqual({ min: 0, max: 0 });
  });

  it("floors a low-level, low-power, doubly-resisted hit up to a minimum of 1 damage", () => {
    // Hand-verified: level 5, atk 10, def 20, power 10, no STAB, 0.25x
    // effectiveness (fire vs water/dragon: 0.5 * 0.5).
    //   floor(2*5/5 + 2) = 4
    //   floor(4 * 10 * (10/20)) = floor(20) = 20
    //   floor(20 / 50) = 0; base = 0 + 2 = 2
    //   max (unclamped) = floor(2 * 1 * 0.25 * 1.0) = floor(0.5) = 0
    //   min (unclamped) = floor(2 * 1 * 0.25 * 0.85) = floor(0.425) = 0
    // Both round to 0 pre-clamp; since effectiveness > 0 (not immune),
    // both should be clamped up to 1.
    const lowLevelAttacker = { hp: 20, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 };
    const lowLevelDefender = { hp: 20, atk: 10, def: 20, spa: 10, spd: 10, spe: 10 };
    const move: MoveData = {
      name: "ember",
      type: "fire",
      category: "physical",
      power: 10,
      priority: 0,
      highCritRate: false,
    };
    const result = calculateDamageRange(
      5,
      lowLevelAttacker,
      lowLevelDefender,
      move,
      ["normal"],
      ["water", "dragon"]
    );
    expect(result).toEqual({ min: 1, max: 1 });
  });
});
```

- [ ] **Step 6: Update `web/src/core/matchup.test.ts`** to add `highCritRate: false,` to every `MoveData` literal

Replace the entire file with:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { evaluateMatchup } from "./matchup";
import { getSpeciesInfo } from "./pokeapi";
import { getBaseStats } from "./baseStats";
import { getMoveData } from "./moveData";
import type { MoveData, StatBlock } from "./types";

vi.mock("./pokeapi", () => ({ getSpeciesInfo: vi.fn() }));
vi.mock("./baseStats", () => ({ getBaseStats: vi.fn() }));
vi.mock("./moveData", () => ({ getMoveData: vi.fn() }));

const mockedGetSpeciesInfo = vi.mocked(getSpeciesInfo);
const mockedGetBaseStats = vi.mocked(getBaseStats);
const mockedGetMoveData = vi.mocked(getMoveData);

const attackerBase: StatBlock = { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 };
const defenderBase: StatBlock = { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 90 };
const perfectIvs: StatBlock = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const zeroEvs: StatBlock = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

const vineWhip: MoveData = {
  name: "vine-whip",
  type: "grass",
  category: "physical",
  power: 45,
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

  mockedGetSpeciesInfo.mockImplementation(async (species: string) => {
    const types = species === "Attacker" ? attackerTypes : defenderTypes;
    return { name: species, types, abilities: [], spriteUrl: null };
  });
  mockedGetBaseStats.mockImplementation(async (species: string) => {
    return species === "Attacker"
      ? overrides?.attackerBaseStats ?? attackerBase
      : overrides?.defenderBaseStats ?? defenderBase;
  });
  mockedGetMoveData.mockResolvedValue(overrides?.move ?? vineWhip);
}

describe("evaluateMatchup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computes an exact hand-verified matchup result", async () => {
    setupMocks();

    const result = await evaluateMatchup({
      attacker: { species: "Attacker", level: 50, nature: "Hardy", ivs: perfectIvs, evs: zeroEvs },
      attackerMove: "Vine Whip",
      defender: { species: "Defender", level: 50, dynamaxState: null },
    });

    expect(result).toEqual({
      damageRange: { min: 13, max: 15 },
      hitsToKO: { min: 8, max: 10 },
      moveOrder: "defender",
    });
  });

  it("returns 'attacker' move order for a positive-priority move even with lower Speed", async () => {
    setupMocks({
      move: { name: "quick-attack", type: "normal", category: "physical", power: 40, priority: 1, highCritRate: false },
    });

    const result = await evaluateMatchup({
      attacker: { species: "Attacker", level: 50, nature: "Hardy", ivs: perfectIvs, evs: zeroEvs },
      attackerMove: "Quick Attack",
      defender: { species: "Defender", level: 50, dynamaxState: null },
    });

    expect(result!.moveOrder).toBe("attacker");
  });

  it("returns null for a status move", async () => {
    setupMocks({
      move: { name: "growl", type: "normal", category: "status", power: null, priority: 0, highCritRate: false },
    });

    const result = await evaluateMatchup({
      attacker: { species: "Attacker", level: 50, nature: "Hardy", ivs: perfectIvs, evs: zeroEvs },
      attackerMove: "Growl",
      defender: { species: "Defender", level: 50, dynamaxState: null },
    });

    expect(result).toBeNull();
  });

  it("returns null when a species lookup fails", async () => {
    mockedGetSpeciesInfo.mockResolvedValue(null);
    mockedGetBaseStats.mockResolvedValue(attackerBase);
    mockedGetMoveData.mockResolvedValue(vineWhip);

    const result = await evaluateMatchup({
      attacker: { species: "Attacker", level: 50, nature: "Hardy", ivs: perfectIvs, evs: zeroEvs },
      attackerMove: "Vine Whip",
      defender: { species: "Defender", level: 50, dynamaxState: null },
    });

    expect(result).toBeNull();
  });

  it("returns null for an unknown nature", async () => {
    setupMocks();

    const result = await evaluateMatchup({
      attacker: { species: "Attacker", level: 50, nature: "NotANature", ivs: perfectIvs, evs: zeroEvs },
      attackerMove: "Vine Whip",
      defender: { species: "Defender", level: 50, dynamaxState: null },
    });

    expect(result).toBeNull();
  });

  it("boosts defender HP for a Dynamaxed defender, increasing hitsToKO", async () => {
    setupMocks();

    const normal = await evaluateMatchup({
      attacker: { species: "Attacker", level: 50, nature: "Hardy", ivs: perfectIvs, evs: zeroEvs },
      attackerMove: "Vine Whip",
      defender: { species: "Defender", level: 50, dynamaxState: null },
    });
    const dynamaxed = await evaluateMatchup({
      attacker: { species: "Attacker", level: 50, nature: "Hardy", ivs: perfectIvs, evs: zeroEvs },
      attackerMove: "Vine Whip",
      defender: { species: "Defender", level: 50, dynamaxState: "Dynamax" },
    });

    expect(dynamaxed!.hitsToKO.max).toBeGreaterThanOrEqual(normal!.hitsToKO.max);
  });

  it("returns Infinity hits-to-KO for a type-immune matchup", async () => {
    setupMocks({
      attackerTypes: ["normal"],
      defenderTypes: ["ghost"],
      move: { name: "tackle", type: "normal", category: "physical", power: 40, priority: 0, highCritRate: false },
    });

    const result = await evaluateMatchup({
      attacker: { species: "Attacker", level: 50, nature: "Hardy", ivs: perfectIvs, evs: zeroEvs },
      attackerMove: "Tackle",
      defender: { species: "Defender", level: 50, dynamaxState: null },
    });

    expect(result!.damageRange).toEqual({ min: 0, max: 0 });
    expect(result!.hitsToKO.max).toBe(Infinity);
  });
});
```

- [ ] **Step 7: Run the full test suite and verify everything passes**

Run (from `web/`): `npm test`
Expected: PASS — all tests, including the updated Phase 3a tests and the new `highCritRate` test, pass with pristine output.

- [ ] **Step 8: Run the typecheck**

Run (from `web/`): `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add web/src/core/types.ts web/src/core/moveData.ts web/src/core/moveData.test.ts web/src/core/damage.test.ts web/src/core/matchup.test.ts
git commit -m "Add highCritRate to MoveData for Gen 1's crit mechanic"
```

---

### Task 2: Gen 1 type chart (generated)

**Files:**
- Test: `web/src/core/gen1TypeChart.test.ts`
- Create: `web/src/core/gen1TypeChart.ts`

**Interfaces:**
- Consumes: `TYPE_CHART` from `./typeChart` (Phase 3a, already merged and verified).
- Produces: `GEN1_TYPE_CHART: Record<string, Record<string, number>>`, `getGen1TypeEffectiveness(attackingType: string, defendingType: string): number`.

- [ ] **Step 1: Write the failing test file** — `web/src/core/gen1TypeChart.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { GEN1_TYPE_CHART, getGen1TypeEffectiveness } from "./gen1TypeChart";

describe("GEN1_TYPE_CHART", () => {
  it("has exactly the 15 Gen 1 types, no Dark/Steel/Fairy", () => {
    const types = Object.keys(GEN1_TYPE_CHART);
    expect(types).toHaveLength(15);
    expect(types).not.toContain("dark");
    expect(types).not.toContain("steel");
    expect(types).not.toContain("fairy");
    for (const attackingType of types) {
      expect(Object.keys(GEN1_TYPE_CHART[attackingType])).toHaveLength(15);
    }
  });

  it("applies the 5 documented Gen 1 historical deviations", () => {
    expect(getGen1TypeEffectiveness("ghost", "psychic")).toBe(0);
    expect(getGen1TypeEffectiveness("ghost", "ghost")).toBe(0);
    expect(getGen1TypeEffectiveness("bug", "poison")).toBe(2);
    expect(getGen1TypeEffectiveness("poison", "bug")).toBe(2);
    expect(getGen1TypeEffectiveness("ice", "poison")).toBe(1);
  });

  it("matches the modern chart for unchanged matchups", () => {
    expect(getGen1TypeEffectiveness("fire", "water")).toBe(0.5);
    expect(getGen1TypeEffectiveness("water", "fire")).toBe(2);
    expect(getGen1TypeEffectiveness("electric", "ground")).toBe(0);
    expect(getGen1TypeEffectiveness("normal", "ghost")).toBe(0);
    expect(getGen1TypeEffectiveness("fighting", "ghost")).toBe(0);
  });

  it("falls back to neutral for an unknown type pairing", () => {
    expect(getGen1TypeEffectiveness("nottype", "fire")).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run (from `web/`): `npm test -- src/core/gen1TypeChart.test.ts`
Expected: FAIL — `Cannot find module './gen1TypeChart'`.

- [ ] **Step 3: Create `web/src/core/gen1TypeChart.ts`**

```ts
import { TYPE_CHART } from "./typeChart";

const GEN1_TYPES = [
  "normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
] as const;

// Documented historical deviations from the modern (Gen 6+) chart. See
// the Phase 3b spec for provenance and the note that this list was
// asserted from general knowledge rather than freshly re-verified,
// since automated research on the source table proved unreliable.
const GEN1_OVERRIDES: Record<string, Record<string, number>> = {
  ghost: { psychic: 0, ghost: 0 },
  bug: { poison: 2 },
  poison: { bug: 2 },
  ice: { poison: 1 },
};

function buildGen1TypeChart(): Record<string, Record<string, number>> {
  const chart: Record<string, Record<string, number>> = {};
  for (const attackingType of GEN1_TYPES) {
    const row: Record<string, number> = {};
    for (const defendingType of GEN1_TYPES) {
      row[defendingType] =
        GEN1_OVERRIDES[attackingType]?.[defendingType] ??
        TYPE_CHART[attackingType][defendingType];
    }
    chart[attackingType] = row;
  }
  return chart;
}

export const GEN1_TYPE_CHART: Record<string, Record<string, number>> = buildGen1TypeChart();

export function getGen1TypeEffectiveness(
  attackingType: string,
  defendingType: string
): number {
  return GEN1_TYPE_CHART[attackingType]?.[defendingType] ?? 1;
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run (from `web/`): `npm test`
Expected: PASS — all 4 new tests, plus every prior test, pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/core/gen1TypeChart.ts web/src/core/gen1TypeChart.test.ts
git commit -m "Add generated Gen 1 type chart (15 types, 5 historical overrides)"
```

---

### Task 3: Gen 1 stat calculator

**Files:**
- Test: `web/src/core/gen1Stats.test.ts`
- Create: `web/src/core/gen1Stats.ts`

**Interfaces:**
- Consumes: `StatBlock` type from `./types` (existing).
- Produces: `calculateGen1Stats(base: StatBlock, dvs: StatBlock, statExp: StatBlock, level: number): StatBlock`

- [ ] **Step 1: Write the failing test file** — `web/src/core/gen1Stats.test.ts`

Both expected results are hand-computed from the real Gen 1/2 formula
(`⌊((Base+DV)×2+⌊⌈√StatExp⌉/4⌋)×Level/100⌋+Level+10` for HP, `+5` for
others) — see the spec for the worked arithmetic.

```ts
import { describe, it, expect } from "vitest";
import { calculateGen1Stats } from "./gen1Stats";

const base = { hp: 78, atk: 84, def: 78, spa: 85, spd: 85, spe: 100 };

describe("calculateGen1Stats", () => {
  it("computes stats with max DVs and max Stat Experience (even division)", () => {
    const dvs = { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 };
    const statExp = { hp: 65535, atk: 65535, def: 65535, spa: 65535, spd: 65535, spe: 65535 };

    const result = calculateGen1Stats(base, dvs, statExp, 50);

    expect(result).toEqual({ hp: 185, atk: 136, def: 130, spa: 137, spd: 137, spe: 152 });
  });

  it("computes stats with partial DVs and Stat Experience (exercises real flooring)", () => {
    const dvs = { hp: 10, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 };
    const statExp = { hp: 30000, atk: 30000, def: 30000, spa: 30000, spd: 30000, spe: 30000 };

    const result = calculateGen1Stats(base, dvs, statExp, 55);

    expect(result).toEqual({ hp: 185, atk: 132, def: 125, spa: 133, spd: 133, spe: 149 });
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run (from `web/`): `npm test -- src/core/gen1Stats.test.ts`
Expected: FAIL — `Cannot find module './gen1Stats'`.

- [ ] **Step 3: Create `web/src/core/gen1Stats.ts`**

```ts
import type { StatBlock } from "./types";

export function calculateGen1Stats(
  base: StatBlock,
  dvs: StatBlock,
  statExp: StatBlock,
  level: number
): StatBlock {
  const statExpTerm = (key: keyof StatBlock): number =>
    Math.floor(Math.ceil(Math.sqrt(statExp[key])) / 4);

  const hp =
    Math.floor((((base.hp + dvs.hp) * 2 + statExpTerm("hp")) * level) / 100) + level + 10;

  const otherStat = (key: "atk" | "def" | "spa" | "spd" | "spe"): number =>
    Math.floor((((base[key] + dvs[key]) * 2 + statExpTerm(key)) * level) / 100) + 5;

  return {
    hp,
    atk: otherStat("atk"),
    def: otherStat("def"),
    spa: otherStat("spa"),
    spd: otherStat("spd"),
    spe: otherStat("spe"),
  };
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run (from `web/`): `npm test`
Expected: PASS — both new tests, plus every prior test, pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/core/gen1Stats.ts web/src/core/gen1Stats.test.ts
git commit -m "Add Gen 1/2 stat calculator (DV/Stat Experience formula)"
```

---

### Task 4: Gen 1 critical-hit chance

**Files:**
- Test: `web/src/core/gen1Crit.test.ts`
- Create: `web/src/core/gen1Crit.ts`

**Interfaces:**
- Produces: `getGen1CritChance(baseSpeed: number, highCritRate: boolean): number`

- [ ] **Step 1: Write the failing test file** — `web/src/core/gen1Crit.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { getGen1CritChance } from "./gen1Crit";

describe("getGen1CritChance", () => {
  it("computes the normal-move threshold as floor(baseSpeed/2)/256", () => {
    expect(getGen1CritChance(100, false)).toBeCloseTo(50 / 256);
    expect(getGen1CritChance(45, false)).toBeCloseTo(22 / 256);
    expect(getGen1CritChance(15, false)).toBeCloseTo(7 / 256);
  });

  it("multiplies the threshold by 8 for high-crit-rate moves, capped at 255/256", () => {
    expect(getGen1CritChance(100, true)).toBeCloseTo(255 / 256); // min(50*8, 255) = 255 (capped)
    expect(getGen1CritChance(15, true)).toBeCloseTo(56 / 256); // min(7*8, 255) = 56 (not capped)
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run (from `web/`): `npm test -- src/core/gen1Crit.test.ts`
Expected: FAIL — `Cannot find module './gen1Crit'`.

- [ ] **Step 3: Create `web/src/core/gen1Crit.ts`**

```ts
export function getGen1CritChance(baseSpeed: number, highCritRate: boolean): number {
  const baseThreshold = Math.floor(baseSpeed / 2);
  const threshold = highCritRate ? Math.min(baseThreshold * 8, 255) : baseThreshold;
  return threshold / 256;
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run (from `web/`): `npm test`
Expected: PASS — both new tests, plus every prior test, pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/core/gen1Crit.ts web/src/core/gen1Crit.test.ts
git commit -m "Add Gen 1 Speed-based critical-hit chance calculator"
```

---

### Task 5: Gen 1 damage formula

**Files:**
- Test: `web/src/core/gen1Damage.test.ts`
- Create: `web/src/core/gen1Damage.ts`

**Interfaces:**
- Consumes: `getGen1TypeEffectiveness` from `./gen1TypeChart` (Task 2); `StatBlock`, `MoveData` types from `./types`.
- Produces: `interface DamageRange { min: number; max: number }`, `calculateGen1DamageRange(attackerLevel: number, attackerStats: StatBlock, defenderStats: StatBlock, move: MoveData, attackerTypes: string[], defenderTypes: string[], critical: boolean): DamageRange | null`

- [ ] **Step 1: Write the failing test file** — `web/src/core/gen1Damage.test.ts`

Every expected value is hand-computed from the Gen 1 formula
(`base = floor(floor(2×Level×Critical/5+2) × Power × Atk/Def / 50) + 2`,
`damage = floor(base × STAB × TypeEff × RandomFactor)` with
`RandomFactor` ranging 217/255 to 255/255, and **no minimum-damage
clamp**) — see the spec for the worked arithmetic.

```ts
import { describe, it, expect } from "vitest";
import { calculateGen1DamageRange } from "./gen1Damage";
import type { MoveData } from "./types";

const attackerStats = { hp: 150, atk: 100, def: 80, spa: 70, spd: 80, spe: 90 };
const defenderStats = { hp: 150, atk: 80, def: 100, spa: 80, spd: 100, spe: 70 };

describe("calculateGen1DamageRange", () => {
  it("computes a STAB, type-neutral physical move, non-crit", () => {
    const move: MoveData = {
      name: "ember",
      type: "fire",
      category: "physical",
      power: 80,
      priority: 0,
      highCritRate: false,
    };
    const result = calculateGen1DamageRange(50, attackerStats, defenderStats, move, ["fire"], ["normal"], false);
    expect(result).toEqual({ min: 47, max: 55 });
  });

  it("computes the same move as a critical hit, using the doubled level term", () => {
    const move: MoveData = {
      name: "ember",
      type: "fire",
      category: "physical",
      power: 80,
      priority: 0,
      highCritRate: false,
    };
    const result = calculateGen1DamageRange(50, attackerStats, defenderStats, move, ["fire"], ["normal"], true);
    expect(result).toEqual({ min: 88, max: 103 });
  });

  it("computes a non-STAB, super-effective physical move, non-crit", () => {
    const move: MoveData = {
      name: "surf",
      type: "water",
      category: "physical",
      power: 80,
      priority: 0,
      highCritRate: false,
    };
    const result = calculateGen1DamageRange(50, attackerStats, defenderStats, move, ["grass"], ["fire"], false);
    expect(result).toEqual({ min: 62, max: 74 });
  });

  it("uses the special attack/defense stats for a special move, non-crit", () => {
    const move: MoveData = {
      name: "flamethrower",
      type: "fire",
      category: "special",
      power: 90,
      priority: 0,
      highCritRate: false,
    };
    const result = calculateGen1DamageRange(50, attackerStats, defenderStats, move, ["fire"], ["normal"], false);
    expect(result).toEqual({ min: 36, max: 43 });
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
    const result = calculateGen1DamageRange(50, attackerStats, defenderStats, move, ["normal"], ["normal"], false);
    expect(result).toBeNull();
  });

  it("returns a genuine zero range with NO minimum-damage floor, non-crit", () => {
    // Hand-verified: level 5, atk 10, def 50, power 10, no STAB, 0.25x
    // effectiveness (ice vs water/ice: 0.5 * 0.5).
    //   floor(2*5*1/5 + 2) = 4
    //   floor(4 * 10 * (10/50) / 50) + 2 = floor(0.16) + 2 = 2 (base)
    //   min = floor(2 * 1 * 0.25 * (217/255)) = floor(0.425...) = 0
    //   max = floor(2 * 1 * 0.25 * 1.0) = floor(0.5) = 0
    // Unlike Phase 3a's damage.ts, this is NOT clamped to 1 — Gen 1 has
    // no minimum-damage guarantee.
    const lowLevelAttacker = { hp: 20, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 };
    const lowLevelDefender = { hp: 20, atk: 10, def: 50, spa: 10, spd: 10, spe: 10 };
    const move: MoveData = {
      name: "ice-beam",
      type: "ice",
      category: "physical",
      power: 10,
      priority: 0,
      highCritRate: false,
    };
    const result = calculateGen1DamageRange(
      5,
      lowLevelAttacker,
      lowLevelDefender,
      move,
      ["fire"],
      ["water", "ice"],
      false
    );
    expect(result).toEqual({ min: 0, max: 0 });
  });

  it("returns a genuine zero range with no floor even on a critical hit", () => {
    // Same scenario as above, critical=true:
    //   floor(2*5*2/5 + 2) = 6
    //   floor(6 * 10 * (10/50) / 50) + 2 = floor(0.24) + 2 = 2 (base — same as non-crit here)
    //   min/max both floor to 0, same as the non-crit case.
    const lowLevelAttacker = { hp: 20, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 };
    const lowLevelDefender = { hp: 20, atk: 10, def: 50, spa: 10, spd: 10, spe: 10 };
    const move: MoveData = {
      name: "ice-beam",
      type: "ice",
      category: "physical",
      power: 10,
      priority: 0,
      highCritRate: false,
    };
    const result = calculateGen1DamageRange(
      5,
      lowLevelAttacker,
      lowLevelDefender,
      move,
      ["fire"],
      ["water", "ice"],
      true
    );
    expect(result).toEqual({ min: 0, max: 0 });
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run (from `web/`): `npm test -- src/core/gen1Damage.test.ts`
Expected: FAIL — `Cannot find module './gen1Damage'`.

- [ ] **Step 3: Create `web/src/core/gen1Damage.ts`**

```ts
import { getGen1TypeEffectiveness } from "./gen1TypeChart";
import type { StatBlock, MoveData } from "./types";

export interface DamageRange {
  min: number;
  max: number;
}

export function calculateGen1DamageRange(
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
  const criticalMultiplier = critical ? 2 : 1;

  const levelTerm = Math.floor((2 * attackerLevel * criticalMultiplier) / 5 + 2);
  const base = Math.floor((levelTerm * move.power * (atk / def)) / 50) + 2;

  const stab = attackerTypes.includes(move.type) ? 1.5 : 1;

  const typeEffectiveness = defenderTypes.reduce(
    (product, defType) => product * getGen1TypeEffectiveness(move.type, defType),
    1
  );

  // No minimum-damage clamp — Gen 1 can genuinely deal 0 damage.
  const min = Math.floor(base * stab * typeEffectiveness * (217 / 255));
  const max = Math.floor(base * stab * typeEffectiveness * 1.0);

  return { min, max };
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run (from `web/`): `npm test`
Expected: PASS — all 7 new tests, plus every prior test, pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/core/gen1Damage.ts web/src/core/gen1Damage.test.ts
git commit -m "Add Gen 1 damage formula (crit-in-level-term, no minimum floor)"
```

---

### Task 6: Gen 1 historical species types

**Files:**
- Test: `web/src/core/gen1Types.test.ts`
- Create: `web/src/core/gen1Types.ts`

**Interfaces:**
- Consumes: `fetchCached`, `toApiSlug` from `./apiCache` (existing).
- Produces: `getGen1Types(species: string, options?: { cacheDir?: string; fetchImpl?: typeof fetch }): Promise<string[] | null>`

- [ ] **Step 1: Write the failing test file** — `web/src/core/gen1Types.test.ts`

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getGen1Types } from "./gen1Types";

describe("getGen1Types", () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "gen1types-cache-"));
  });

  afterEach(async () => {
    await fs.rm(cacheDir, { recursive: true, force: true });
  });

  it("returns the generation-i past_types entry when present", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        types: [{ type: { name: "fairy" } }],
        past_types: [
          {
            generation: { name: "generation-i" },
            types: [{ type: { name: "normal" } }],
          },
        ],
      }),
    });

    const result = await getGen1Types("Clefairy", { cacheDir, fetchImpl });

    expect(result).toEqual(["normal"]);
  });

  it("falls back to current types when past_types has no generation-i entry", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        types: [{ type: { name: "water" } }],
        past_types: [
          {
            generation: { name: "generation-vi" },
            types: [{ type: { name: "water" } }],
          },
        ],
      }),
    });

    const result = await getGen1Types("Politoed", { cacheDir, fetchImpl });

    expect(result).toEqual(["water"]);
  });

  it("falls back to current types when past_types is absent entirely", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        types: [{ type: { name: "grass" } }, { type: { name: "poison" } }],
      }),
    });

    const result = await getGen1Types("Bulbasaur", { cacheDir, fetchImpl });

    expect(result).toEqual(["grass", "poison"]);
  });

  it("caches the result and does not refetch on a second call", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ types: [{ type: { name: "normal" } }] }),
    });

    await getGen1Types("Rattata", { cacheDir, fetchImpl });
    await getGen1Types("Rattata", { cacheDir, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("negative-caches a failed lookup so it does not refetch", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 });

    const first = await getGen1Types("Missingno", { cacheDir, fetchImpl });
    const second = await getGen1Types("Missingno", { cacheDir, fetchImpl });

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run (from `web/`): `npm test -- src/core/gen1Types.test.ts`
Expected: FAIL — `Cannot find module './gen1Types'`.

- [ ] **Step 3: Create `web/src/core/gen1Types.ts`**

```ts
import path from "node:path";
import { fetchCached, toApiSlug, type FetchCachedParams } from "./apiCache";

const DEFAULT_CACHE_DIR = path.join(process.cwd(), ".cache", "pokeapi-gen1types");
const POKEAPI_BASE = "https://pokeapi.co/api/v2";

interface Options {
  cacheDir?: string;
  fetchImpl?: typeof fetch;
}

interface PastTypeEntry {
  generation: { name: string };
  types: { type: { name: string } }[];
}

export async function getGen1Types(
  species: string,
  options: Options = {}
): Promise<string[] | null> {
  const cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;
  const fetchImpl = options.fetchImpl ?? fetch;
  const slug = toApiSlug(species);

  const params: FetchCachedParams<string[]> = {
    cacheKey: slug,
    cacheDir,
    url: `${POKEAPI_BASE}/pokemon/${encodeURIComponent(slug)}`,
    fetchImpl,
    errorLabel: `Gen 1 types for species "${species}"`,
    parse: (data) => {
      const d = data as {
        types?: { type: { name: string } }[];
        past_types?: PastTypeEntry[];
      };
      if (!d.types) return null;

      const gen1Entry = d.past_types?.find(
        (entry) => entry.generation.name === "generation-i"
      );
      if (gen1Entry) {
        return gen1Entry.types.map((t) => t.type.name);
      }
      return d.types.map((t) => t.type.name);
    },
  };

  return fetchCached<string[]>(params);
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run (from `web/`): `npm test`
Expected: PASS — all 5 new tests, plus every prior test, pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/core/gen1Types.ts web/src/core/gen1Types.test.ts
git commit -m "Add Gen 1 historical species-type lookup (past_types)"
```

---

### Task 7: Gen 1 matchup evaluator (orchestrator)

**Files:**
- Test: `web/src/core/gen1Matchup.test.ts`
- Create: `web/src/core/gen1Matchup.ts`

**Interfaces:**
- Consumes: `getGen1Types` from `./gen1Types` (Task 6); `getBaseStats` from `./baseStats` (Phase 3a); `getMoveData` from `./moveData` (Phase 3a, extended in Task 1); `calculateGen1Stats` from `./gen1Stats` (Task 3); `calculateGen1DamageRange` from `./gen1Damage` (Task 5); `getGen1CritChance` from `./gen1Crit` (Task 4); `StatBlock` from `./types`.
- Produces: `interface Gen1MatchupInput`, `interface Gen1MatchupResult`, `evaluateGen1Matchup(input: Gen1MatchupInput): Promise<Gen1MatchupResult | null>` — the module a later phase will call directly.

- [ ] **Step 1: Write the failing test file** — `web/src/core/gen1Matchup.test.ts`

The "exact hand-verified matchup result" test's numbers are hand-computed
by chaining Task 3's stat formula, Task 4's crit formula, and Task 5's
damage formula together — see the spec for the arithmetic. Note the base
stat fixtures deliberately set `spd` different from `spa`, to prove the
single-Special-stat handling (`spd` overridden to equal `spa`) is actually
being applied, not just coincidentally equal.

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { evaluateGen1Matchup } from "./gen1Matchup";
import { getGen1Types } from "./gen1Types";
import { getBaseStats } from "./baseStats";
import { getMoveData } from "./moveData";
import type { MoveData, StatBlock } from "./types";

vi.mock("./gen1Types", () => ({ getGen1Types: vi.fn() }));
vi.mock("./baseStats", () => ({ getBaseStats: vi.fn() }));
vi.mock("./moveData", () => ({ getMoveData: vi.fn() }));

const mockedGetGen1Types = vi.mocked(getGen1Types);
const mockedGetBaseStats = vi.mocked(getBaseStats);
const mockedGetMoveData = vi.mocked(getMoveData);

// spd deliberately differs from spa here, to prove toGen1Base's override
// (spd := spa) is what the orchestrator actually applies.
const attackerBase: StatBlock = { hp: 45, atk: 49, def: 49, spa: 65, spd: 50, spe: 45 };
const defenderBase: StatBlock = { hp: 45, atk: 49, def: 49, spa: 65, spd: 70, spe: 90 };
const perfectIvs: StatBlock = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const zeroEvs: StatBlock = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

const vineWhip: MoveData = {
  name: "vine-whip",
  type: "grass",
  category: "physical",
  power: 45,
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

  mockedGetGen1Types.mockImplementation(async (species: string) => {
    return species === "Attacker" ? attackerTypes : defenderTypes;
  });
  mockedGetBaseStats.mockImplementation(async (species: string) => {
    return species === "Attacker"
      ? overrides?.attackerBaseStats ?? attackerBase
      : overrides?.defenderBaseStats ?? defenderBase;
  });
  mockedGetMoveData.mockResolvedValue(overrides?.move ?? vineWhip);
}

describe("evaluateGen1Matchup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computes an exact hand-verified matchup result, including crit chance and crit damage", async () => {
    setupMocks();

    const result = await evaluateGen1Matchup({
      attacker: { species: "Attacker", level: 50, ivs: perfectIvs, evs: zeroEvs },
      attackerMove: "Vine Whip",
      defender: { species: "Defender", level: 50 },
    });

    expect(result).toEqual({
      normal: {
        damageRange: { min: 13, max: 15 },
        hitsToKO: { min: 8, max: 10 },
      },
      criticalHit: {
        chance: 22 / 256,
        damageRange: { min: 24, max: 29 },
        hitsToKO: { min: 5, max: 5 },
      },
      moveOrder: "defender",
    });
  });

  it("returns null for a status move", async () => {
    setupMocks({
      move: { name: "growl", type: "normal", category: "status", power: null, priority: 0, highCritRate: false },
    });

    const result = await evaluateGen1Matchup({
      attacker: { species: "Attacker", level: 50, ivs: perfectIvs, evs: zeroEvs },
      attackerMove: "Growl",
      defender: { species: "Defender", level: 50 },
    });

    expect(result).toBeNull();
  });

  it("returns null when a types lookup fails", async () => {
    mockedGetGen1Types.mockResolvedValue(null);
    mockedGetBaseStats.mockResolvedValue(attackerBase);
    mockedGetMoveData.mockResolvedValue(vineWhip);

    const result = await evaluateGen1Matchup({
      attacker: { species: "Attacker", level: 50, ivs: perfectIvs, evs: zeroEvs },
      attackerMove: "Vine Whip",
      defender: { species: "Defender", level: 50 },
    });

    expect(result).toBeNull();
  });

  it("returns 'attacker' move order for a positive-priority move even with lower Speed", async () => {
    setupMocks({
      move: { name: "quick-attack", type: "normal", category: "physical", power: 40, priority: 1, highCritRate: false },
    });

    const result = await evaluateGen1Matchup({
      attacker: { species: "Attacker", level: 50, ivs: perfectIvs, evs: zeroEvs },
      attackerMove: "Quick Attack",
      defender: { species: "Defender", level: 50 },
    });

    expect(result!.moveOrder).toBe("attacker");
  });

  it("returns a zero damage range with no floor for a type-immune matchup, and Infinity hitsToKO", async () => {
    setupMocks({
      attackerTypes: ["normal"],
      defenderTypes: ["ghost"],
      move: { name: "tackle", type: "normal", category: "physical", power: 40, priority: 0, highCritRate: false },
    });

    const result = await evaluateGen1Matchup({
      attacker: { species: "Attacker", level: 50, ivs: perfectIvs, evs: zeroEvs },
      attackerMove: "Tackle",
      defender: { species: "Defender", level: 50 },
    });

    expect(result!.normal.damageRange).toEqual({ min: 0, max: 0 });
    expect(result!.normal.hitsToKO.max).toBe(Infinity);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run (from `web/`): `npm test -- src/core/gen1Matchup.test.ts`
Expected: FAIL — `Cannot find module './gen1Matchup'`.

- [ ] **Step 3: Create `web/src/core/gen1Matchup.ts`**

```ts
import { getGen1Types } from "./gen1Types";
import { getBaseStats } from "./baseStats";
import { getMoveData } from "./moveData";
import { calculateGen1Stats } from "./gen1Stats";
import { calculateGen1DamageRange } from "./gen1Damage";
import { getGen1CritChance } from "./gen1Crit";
import type { StatBlock, MoveData } from "./types";

export interface Gen1MatchupAttacker {
  species: string;
  level: number;
  ivs: StatBlock;
  evs: StatBlock;
}

export interface Gen1MatchupDefender {
  species: string;
  level: number;
}

export interface Gen1MatchupInput {
  attacker: Gen1MatchupAttacker;
  attackerMove: string;
  defender: Gen1MatchupDefender;
}

export interface Gen1MatchupOutcome {
  damageRange: { min: number; max: number };
  hitsToKO: { min: number; max: number };
}

export interface Gen1MatchupResult {
  normal: Gen1MatchupOutcome;
  criticalHit: { chance: number } & Gen1MatchupOutcome;
  moveOrder: "attacker" | "defender" | "tie";
}

const PERFECT_DV: StatBlock = { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 };
const ZERO_STAT_EXP: StatBlock = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

function ivsToDvs(ivs: StatBlock): StatBlock {
  const toDv = (iv: number) => Math.min(15, Math.max(0, Math.round(iv / 2)));
  return {
    hp: toDv(ivs.hp),
    atk: toDv(ivs.atk),
    def: toDv(ivs.def),
    spa: toDv(ivs.spa),
    spd: toDv(ivs.spd),
    spe: toDv(ivs.spe),
  };
}

function evsToStatExp(evs: StatBlock): StatBlock {
  const toStatExp = (ev: number) =>
    Math.min(65535, Math.max(0, Math.round((ev / 252) * 65535)));
  return {
    hp: toStatExp(evs.hp),
    atk: toStatExp(evs.atk),
    def: toStatExp(evs.def),
    spa: toStatExp(evs.spa),
    spd: toStatExp(evs.spd),
    spe: toStatExp(evs.spe),
  };
}

/** Gen 1 has a single "Special" stat; represent it by using base Special
 * Attack for both offense and defense (historically accurate — Gen 2's
 * stat split set Special Defense equal to the old Special stat). */
function toGen1Base(base: StatBlock): StatBlock {
  return { ...base, spd: base.spa };
}

function outcomeFor(
  attackerLevel: number,
  attackerStats: StatBlock,
  defenderStats: StatBlock,
  move: MoveData,
  attackerTypes: string[],
  defenderTypes: string[],
  critical: boolean
): Gen1MatchupOutcome | null {
  const damageRange = calculateGen1DamageRange(
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

export async function evaluateGen1Matchup(
  input: Gen1MatchupInput
): Promise<Gen1MatchupResult | null> {
  const { attacker, attackerMove, defender } = input;

  const [attackerTypes, defenderTypes, attackerBase, defenderBase, move] = await Promise.all([
    getGen1Types(attacker.species),
    getGen1Types(defender.species),
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

  const attackerStats = calculateGen1Stats(
    toGen1Base(attackerBase),
    ivsToDvs(attacker.ivs),
    evsToStatExp(attacker.evs),
    attacker.level
  );
  const defenderStats = calculateGen1Stats(
    toGen1Base(defenderBase),
    PERFECT_DV,
    ZERO_STAT_EXP,
    defender.level
  );

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

  const critChance = getGen1CritChance(attackerBase.spe, move.highCritRate);

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
Expected: PASS — all 5 new tests, plus every prior test, pass.

- [ ] **Step 5: Run the typecheck**

Run (from `web/`): `npx tsc --noEmit`
Expected: clean, no errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/core/gen1Matchup.ts web/src/core/gen1Matchup.test.ts
git commit -m "Add Gen 1 matchup evaluator (stats, crit chance/damage, move order)"
```

---

## Self-Review Notes

- **Spec coverage:** the `MoveData.highCritRate` cross-cutting extension (Task 1, including updating every existing consumer so the suite keeps compiling), the generated type chart with its 5 documented overrides (Task 2), the DV/Stat-Experience stat formula (Task 3), the Speed-based crit chance (Task 4), the crit-in-level-term damage formula with no minimum floor (Task 5), the `past_types`-based historical species types (Task 6), and the full orchestrator wiring reinterpretation/single-Special-stat/crit/move-order together (Task 7) are all covered. The spec's exclusions (no status/weather/items, no authentic DV/StatExp roster entry) are correctly absent from every task.
- **Placeholder scan:** none — every step has full file contents or an exact command with an exact expected result.
- **Type consistency:** `MoveData.highCritRate` is added once in Task 1 and consumed identically by `gen1Damage.ts` (indirectly, via the shared `MoveData` type) and `gen1Matchup.ts`/`gen1Crit.ts` directly. `StatBlock` flows unchanged from the existing type through `gen1Stats.ts`, `gen1Damage.ts`, and `gen1Matchup.ts`. `calculateGen1DamageRange`'s `critical: boolean` parameter is threaded consistently from `gen1Matchup.ts`'s two `outcomeFor` calls through to the formula.
- **Formula accuracy:** every pure-function test fixture (Tasks 2-5) was hand-computed independently, and Task 7's orchestrator test chains all of them together into one hand-verified end-to-end result — the same two-layer verification discipline Phase 3a used (unit-level exact values, then one orchestrator-level exact value proving the wiring, not just the pieces).
