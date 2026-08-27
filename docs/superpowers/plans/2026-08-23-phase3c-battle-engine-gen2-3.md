# Phase 3c: Battle Engine (Gen 2-3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A framework-free `evaluateGen23Matchup` orchestrator implementing Gen 2 and Gen 3's shared mechanics (type-based move category, a stage-based critical-hit system, a 17-type chart) while branching internally on `generation: 2 | 3` for the one thing that genuinely differs between them — Gen 2 still uses Gen 1's DV/Stat-Experience stat system with no natures, while Gen 3 introduced the modern IV/EV/nature system this app already uses for Gen 6-9.

**Architecture:** Two small bounded refactors to already-shipped Phase 3b code (generalizing `gen1Types.ts`'s historical-typing lookup to serve any generation, and exporting Gen 1's private DV/Stat-Experience reinterpretation helpers so Gen 2 can reuse them) — both must leave Phase 3b's existing tests passing unchanged. Then five new `gen23`-prefixed modules: a generated type chart, a hardcoded type→category table, a stage-based crit calculator, a damage formula (structurally close to Phase 3a's, with a post-hoc crit multiplier and a 1-HP floor), and the orchestrator, which reuses `gen1Stats.ts`'s formula for Gen 2 and Phase 3a's `stats.ts` for Gen 3 — no new stat-calculation code is needed for either branch.

**Tech Stack:** TypeScript, Vitest. Builds directly on Phase 3a's and Phase 3b's modules.

**Spec:** [docs/superpowers/specs/2026-08-23-phase3c-battle-engine-gen2-3-design.md](../specs/2026-08-23-phase3c-battle-engine-gen2-3-design.md)

## Global Constraints

- This plan covers **only** Gen 2 and Gen 3. Gen 4-5 is a separate future phase (3d).
- No status conditions, weather, held items, or abilities — same as every prior battle-engine phase, no data exists for any of this.
- Every new/modified `core/` module has zero Next.js/React imports.
- **Move category is type-determined in Gen 2-3, not per-move** — a hardcoded table drives this (`gen23Category.ts`), not `MoveData.category` (which reflects the modern, Gen 4+, per-move system). Status-move detection still uses `MoveData.category === "status"`, since status-ness itself didn't change.
- **Gen 2-3's type chart** differs from the modern (Gen 6-9) chart in exactly one respect, independently verified against a live source during this plan's research: Steel resisted Ghost- and Dark-type moves (0.5×) in Gen 2-5, becoming neutral (1×) from Gen 6 on. No other cell differs; Fairy simply doesn't exist yet (17 types, not 18). **The override table is keyed by attacking type first** (`ghost: { steel: 0.5 }, dark: { steel: 0.5 }`), matching this codebase's established `TYPE_CHART[attackingType][defendingType]` convention — do NOT key it as `steel: { ghost: 0.5, dark: 0.5 }`, which would incorrectly nerf Steel's own offensive moves instead of nerfing Ghost/Dark moves against Steel defenders.
- **Gen 2-3's damage formula has a 1-HP minimum floor** for any non-immune hit (unlike Gen 1, which has none) — same floor logic as Phase 3a's `damage.ts`. A true type immunity (`typeEffectiveness === 0`) stays `{min: 0, max: 0}`, un-floored, so `hitsToKO` can still resolve to `Infinity`.
- **Critical hits are a post-hoc ×2 multiplier** on the final damage in Gen 2-3 (unlike Gen 1, which folds the crit multiplier into the level term itself) — this must be applied identically to how Phase 3a's `damage.ts` would apply it if it modeled crits (which it doesn't; Phase 3a has no crit modeling at all).
- **Gen 2 has no natures.** `Gen23MatchupAttacker.nature` is a nature *name* (`string`), matching `MatchupAttacker`'s existing convention in `matchup.ts` — not a `Nature` object. It is looked up via `NATURES.find()` only on the Gen 3 branch; the Gen 2 branch ignores it entirely.
- **Gen 2's `spd` is NOT overridden** the way Gen 1's is. Gen 1 has a single "Special" stat and fakes the split by setting `spd := spa` (in `gen1Matchup.ts`'s `toGen1Base`). Gen 2 already has genuinely separate Special Attack/Special Defense values in PokeAPI's base stats — use `attackerBase.spd`/`defenderBase.spd` directly, un-overridden, on the Gen 2 branch.

---

### Task 1: Generalize `gen1Types.ts`'s historical-typing lookup

**Files:**
- Modify: `web/src/core/gen1Types.ts`
- Modify: `web/src/core/gen1Types.test.ts`

**Interfaces:**
- Produces: `getHistoricalTypes(species: string, generation: number, options?: { cacheDir?: string; fetchImpl?: typeof fetch }): Promise<string[] | null>` (new, generation-agnostic). `getGen1Types(species, options?)` stays exported with its existing signature, now a thin wrapper calling `getHistoricalTypes(species, 1, options)` — **`gen1Matchup.ts` requires no changes** as a result of this task.

This is a pure refactor: Phase 3b's existing behavior for `generation=1` must be provably unchanged (every existing `gen1Types.test.ts` test must keep passing, unmodified, calling `getGen1Types`).

**Background:** PokeAPI's `past_types[].generation` names the LAST generation a species had that typing — not the generation it's accurate for. The typing effective during a target generation `G` is the entry with the SMALLEST generation number that is `>= G` (the first recorded checkpoint not yet superseded by `G`); if no entry qualifies, `G` is more recent than every recorded change, so the current typing (`d.types`) applies. For `G = 1` this is provably identical to "the earliest entry" (every entry's generation number is trivially `>= 1`), which is exactly what `getGen1Types` already does.

- [ ] **Step 1: Write the new failing tests in `gen1Types.test.ts`**

Add a new `describe("getHistoricalTypes", ...)` block AFTER the existing `describe("getGen1Types", ...)` block (leave that block completely unchanged). Add this import to the top of the file (alongside the existing `getGen1Types` import):

```ts
import { getGen1Types, getHistoricalTypes } from "./gen1Types";
```

New block to add at the end of the file:

```ts
describe("getHistoricalTypes", () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "historicaltypes-cache-"));
  });

  afterEach(async () => {
    await fs.rm(cacheDir, { recursive: true, force: true });
  });

  // One species with two historical typing changes (recorded at
  // generation-ii and generation-iv), so a single fixture proves the
  // "smallest qualifying entry" selection rule across five target
  // generations at once.
  function mockMultiCheckpointSpecies() {
    return vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        types: [{ type: { name: "dark" } }],
        past_types: [
          {
            generation: { name: "generation-ii" },
            types: [{ type: { name: "normal" } }],
          },
          {
            generation: { name: "generation-iv" },
            types: [{ type: { name: "psychic" } }],
          },
        ],
      }),
    });
  }

  it("generation=1: selects the earliest qualifying entry (generation-ii, since 2 >= 1)", async () => {
    const fetchImpl = mockMultiCheckpointSpecies();
    const result = await getHistoricalTypes("TestMon", 1, { cacheDir, fetchImpl });
    expect(result).toEqual(["normal"]);
  });

  it("generation=2: still selects the generation-ii entry (2 >= 2)", async () => {
    const fetchImpl = mockMultiCheckpointSpecies();
    const result = await getHistoricalTypes("TestMon", 2, { cacheDir, fetchImpl });
    expect(result).toEqual(["normal"]);
  });

  it("generation=3: generation-ii no longer qualifies (2 < 3), selects generation-iv instead (4 >= 3)", async () => {
    const fetchImpl = mockMultiCheckpointSpecies();
    const result = await getHistoricalTypes("TestMon", 3, { cacheDir, fetchImpl });
    expect(result).toEqual(["psychic"]);
  });

  it("generation=4: still selects the generation-iv entry (4 >= 4)", async () => {
    const fetchImpl = mockMultiCheckpointSpecies();
    const result = await getHistoricalTypes("TestMon", 4, { cacheDir, fetchImpl });
    expect(result).toEqual(["psychic"]);
  });

  it("generation=5: no entry qualifies (2 < 5 and 4 < 5), falls back to current types", async () => {
    const fetchImpl = mockMultiCheckpointSpecies();
    const result = await getHistoricalTypes("TestMon", 5, { cacheDir, fetchImpl });
    expect(result).toEqual(["dark"]);
  });

  it("rejects a Dark type at generation 1 (didn't exist yet) but accepts it from generation 2 onward", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ types: [{ type: { name: "dark" } }] }),
    });

    const atGen1 = await getHistoricalTypes("Umbreon", 1, { cacheDir, fetchImpl });
    const atGen2 = await getHistoricalTypes("Umbreon", 2, { cacheDir, fetchImpl });

    expect(atGen1).toBeNull();
    expect(atGen2).toEqual(["dark"]);
  });

  it("rejects a Fairy type before generation 6, but accepts it from generation 6 onward", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ types: [{ type: { name: "fairy" } }] }),
    });

    const atGen3 = await getHistoricalTypes("Sylveon", 3, { cacheDir, fetchImpl });
    const atGen6 = await getHistoricalTypes("Sylveon", 6, { cacheDir, fetchImpl });

    expect(atGen3).toBeNull();
    expect(atGen6).toEqual(["fairy"]);
  });

  it("uses a generation-specific cache key, so a Gen 1 lookup and a Gen 3 lookup for the same species don't collide", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ types: [{ type: { name: "water" } }] }),
    });

    await getHistoricalTypes("Squirtle", 1, { cacheDir, fetchImpl });
    await getHistoricalTypes("Squirtle", 3, { cacheDir, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the new tests and verify they fail**

Run (from `web/`): `npm test -- src/core/gen1Types.test.ts`
Expected: the new `getHistoricalTypes` tests FAIL (`getHistoricalTypes is not a function` or similar) — the existing `getGen1Types` tests still PASS (nothing about them has changed yet).

- [ ] **Step 3: Replace `web/src/core/gen1Types.ts`**

```ts
import path from "node:path";
import { fetchCached, toApiSlug, type FetchCachedParams } from "./apiCache";

const DEFAULT_CACHE_DIR = path.join(process.cwd(), ".cache", "pokeapi-historicaltypes");
const POKEAPI_BASE = "https://pokeapi.co/api/v2";

interface Options {
  cacheDir?: string;
  fetchImpl?: typeof fetch;
}

interface PastTypeEntry {
  generation: { name: string };
  types: { type: { name: string } }[];
}

/** PokeAPI's `past_types[].generation` names the LAST generation in which a
 * species had that typing — not the generation it "belongs to". The typing
 * effective during a target generation G is therefore the entry with the
 * SMALLEST generation number that is >= G (the first recorded checkpoint
 * not yet superseded by G); if no such entry exists, G is more recent than
 * every recorded change, so the current typing applies. */
const GENERATION_ORDER = [
  "generation-i",
  "generation-ii",
  "generation-iii",
  "generation-iv",
  "generation-v",
  "generation-vi",
  "generation-vii",
  "generation-viii",
  "generation-ix",
];

/** The generation each type was introduced in — used to reject a resolved
 * typing that includes a type that didn't exist yet as of the target
 * generation (e.g. Fairy before Gen 6, or Dark/Steel before Gen 2). */
const TYPE_INTRO_GENERATION: Record<string, number> = {
  normal: 1, fighting: 1, flying: 1, poison: 1, ground: 1, rock: 1, bug: 1,
  ghost: 1, fire: 1, water: 1, grass: 1, electric: 1, psychic: 1, ice: 1,
  dragon: 1,
  dark: 2, steel: 2,
  fairy: 6,
};

function isValidTypeForGeneration(type: string, generation: number): boolean {
  const introGeneration = TYPE_INTRO_GENERATION[type];
  return introGeneration !== undefined && introGeneration <= generation;
}

function typesForGeneration(
  pastTypes: PastTypeEntry[],
  generation: number
): string[] | null {
  let best: PastTypeEntry | null = null;
  let bestIndex = Infinity;
  for (const entry of pastTypes) {
    const index = GENERATION_ORDER.indexOf(entry.generation.name);
    if (index === -1) continue;
    const entryGeneration = index + 1;
    if (entryGeneration >= generation && index < bestIndex) {
      best = entry;
      bestIndex = index;
    }
  }
  return best ? best.types.map((t) => t.type.name) : null;
}

/** Resolves a species' typing as it was during a specific generation,
 * using PokeAPI's `past_types` field. Falls back to the species' current
 * types when no historical entry covers the target generation. Returns
 * `null` if the resolved typing includes a type that didn't exist yet as
 * of that generation — this represents "no valid typing could be
 * determined" rather than silently returning an anachronistic type. */
export async function getHistoricalTypes(
  species: string,
  generation: number,
  options: Options = {}
): Promise<string[] | null> {
  const cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;
  const fetchImpl = options.fetchImpl ?? fetch;
  const slug = toApiSlug(species);

  const params: FetchCachedParams<string[]> = {
    cacheKey: `${slug}-gen${generation}`,
    cacheDir,
    url: `${POKEAPI_BASE}/pokemon/${encodeURIComponent(slug)}`,
    fetchImpl,
    errorLabel: `Gen ${generation} types for species "${species}"`,
    parse: (data) => {
      const d = data as {
        types?: { type: { name: string } }[];
        past_types?: PastTypeEntry[];
      };
      if (!d.types) return null;

      let types: string[] | null = null;
      if (d.past_types && d.past_types.length > 0) {
        types = typesForGeneration(d.past_types, generation);
      }
      if (!types) {
        types = d.types.map((t) => t.type.name);
      }

      if (!types.every((t) => isValidTypeForGeneration(t, generation))) return null;

      return types;
    },
  };

  return fetchCached<string[]>(params);
}

/** Gen 1-specific convenience wrapper — see `getHistoricalTypes`. */
export async function getGen1Types(
  species: string,
  options: Options = {}
): Promise<string[] | null> {
  return getHistoricalTypes(species, 1, options);
}
```

- [ ] **Step 4: Run all tests and verify they pass**

Run (from `web/`): `npm test`
Expected: PASS — every existing `getGen1Types` test in `gen1Types.test.ts` still passes (unchanged behavior for generation=1), all new `getHistoricalTypes` tests pass, and `gen1Matchup.test.ts` still passes unchanged (it imports `getGen1Types`, which still has its exact original signature).

- [ ] **Step 5: Run the typecheck**

Run (from `web/`): `npx tsc --noEmit`
Expected: clean, no errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/core/gen1Types.ts web/src/core/gen1Types.test.ts
git commit -m "Generalize gen1Types.ts to getHistoricalTypes(species, generation)"
```

---

### Task 2: Extract Gen 1 stat-reinterpretation helpers into `gen1Stats.ts`

**Files:**
- Modify: `web/src/core/gen1Stats.ts`
- Modify: `web/src/core/gen1Stats.test.ts`
- Modify: `web/src/core/gen1Matchup.ts`

**Interfaces:**
- Produces (new exports from `gen1Stats.ts`): `ivsToDvs(ivs: StatBlock): StatBlock`, `evsToStatExp(evs: StatBlock): StatBlock`, `PERFECT_DV: StatBlock`, `ZERO_STAT_EXP: StatBlock`.
- `calculateGen1Stats`'s existing signature is unchanged.

This is a pure refactor: move code, change zero formulas. `gen1Matchup.ts`'s behavior and `gen1Matchup.test.ts` must be completely unaffected — only its import line changes.

- [ ] **Step 1: Write the new failing tests in `gen1Stats.test.ts`**

Add this import to the top of the file (alongside the existing `calculateGen1Stats` import):

```ts
import { calculateGen1Stats, ivsToDvs, evsToStatExp, PERFECT_DV, ZERO_STAT_EXP } from "./gen1Stats";
```

Add these new `describe` blocks at the end of the file (leave the existing `describe("calculateGen1Stats", ...)` block completely unchanged):

```ts
describe("ivsToDvs", () => {
  it("halves and rounds an IV to a DV, rounding .5 up", () => {
    const ivs = { hp: 15, atk: 0, def: 31, spa: 20, spd: 1, spe: 30 };
    expect(ivsToDvs(ivs)).toEqual({ hp: 8, atk: 0, def: 15, spa: 10, spd: 1, spe: 15 });
  });

  it("clamps a perfect IV (31) to the maximum DV (15), not 16", () => {
    const ivs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
    expect(ivsToDvs(ivs)).toEqual({ hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 });
  });

  it("clamps a zero IV to a zero DV", () => {
    const ivs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    expect(ivsToDvs(ivs)).toEqual({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
  });
});

describe("evsToStatExp", () => {
  it("scales an EV (0-252) up to the Stat Experience range (0-65535)", () => {
    const evs = { hp: 252, atk: 0, def: 126, spa: 63, spd: 189, spe: 1 };
    // 126/252 * 65535 = 32767.5 -> rounds up to 32768
    // 63/252 * 65535 = 16383.75 -> rounds to 16384
    // 189/252 * 65535 = 49151.25 -> rounds to 49151
    // 1/252 * 65535 = 260.0595... -> rounds to 260
    expect(evsToStatExp(evs)).toEqual({
      hp: 65535,
      atk: 0,
      def: 32768,
      spa: 16384,
      spd: 49151,
      spe: 260,
    });
  });

  it("clamps a max EV (252) to exactly 65535, not slightly over from rounding", () => {
    const evs = { hp: 252, atk: 252, def: 252, spa: 252, spd: 252, spe: 252 };
    expect(evsToStatExp(evs)).toEqual({
      hp: 65535, atk: 65535, def: 65535, spa: 65535, spd: 65535, spe: 65535,
    });
  });

  it("clamps a zero EV to zero Stat Experience", () => {
    const evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    expect(evsToStatExp(evs)).toEqual({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
  });
});

describe("PERFECT_DV and ZERO_STAT_EXP", () => {
  it("PERFECT_DV is 15 for every stat", () => {
    expect(PERFECT_DV).toEqual({ hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 });
  });

  it("ZERO_STAT_EXP is 0 for every stat", () => {
    expect(ZERO_STAT_EXP).toEqual({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
  });
});
```

- [ ] **Step 2: Run the new tests and verify they fail**

Run (from `web/`): `npm test -- src/core/gen1Stats.test.ts`
Expected: FAIL — `ivsToDvs`/`evsToStatExp`/`PERFECT_DV`/`ZERO_STAT_EXP` are not exported from `./gen1Stats` yet.

- [ ] **Step 3: Add the four new exports to `web/src/core/gen1Stats.ts`**

Add this to the END of the existing file (do not change the existing `calculateGen1Stats` function at all):

```ts
export const PERFECT_DV: StatBlock = { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 };
export const ZERO_STAT_EXP: StatBlock = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

export function ivsToDvs(ivs: StatBlock): StatBlock {
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

export function evsToStatExp(evs: StatBlock): StatBlock {
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
```

- [ ] **Step 4: Update `web/src/core/gen1Matchup.ts` to import instead of define these**

Change the import line from:

```ts
import { calculateGen1Stats } from "./gen1Stats";
```

to:

```ts
import { calculateGen1Stats, ivsToDvs, evsToStatExp, PERFECT_DV, ZERO_STAT_EXP } from "./gen1Stats";
```

Then DELETE these four declarations from `gen1Matchup.ts` (they now live in `gen1Stats.ts`):

```ts
const PERFECT_DV: StatBlock = { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 };
const ZERO_STAT_EXP: StatBlock = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

function ivsToDvs(ivs: StatBlock): StatBlock {
  // ... (the whole function)
}

function evsToStatExp(evs: StatBlock): StatBlock {
  // ... (the whole function)
}
```

Everything else in `gen1Matchup.ts` (including `toGen1Base`, which stays — it's Gen-1-specific and does NOT move) is unchanged.

- [ ] **Step 5: Run all tests and verify they pass**

Run (from `web/`): `npm test`
Expected: PASS — new `gen1Stats.test.ts` tests pass, existing `gen1Stats.test.ts` tests unchanged and passing, `gen1Matchup.test.ts` passes completely unchanged (proving the refactor didn't alter `gen1Matchup.ts`'s behavior).

- [ ] **Step 6: Run the typecheck**

Run (from `web/`): `npx tsc --noEmit`
Expected: clean, no errors.

- [ ] **Step 7: Commit**

```bash
git add web/src/core/gen1Stats.ts web/src/core/gen1Stats.test.ts web/src/core/gen1Matchup.ts
git commit -m "Extract Gen 1 DV/Stat-Experience reinterpretation helpers into gen1Stats.ts"
```

---

### Task 3: Gen 2-3 type chart

**Files:**
- Test: `web/src/core/gen23TypeChart.test.ts`
- Create: `web/src/core/gen23TypeChart.ts`

**Interfaces:**
- Consumes: `TYPE_CHART` from `./typeChart` (existing, Phase 3a).
- Produces: `GEN23_TYPE_CHART: Record<string, Record<string, number>>`, `getGen23TypeEffectiveness(attackingType: string, defendingType: string): number`.

- [ ] **Step 1: Write the failing test file** — `web/src/core/gen23TypeChart.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { GEN23_TYPE_CHART, getGen23TypeEffectiveness } from "./gen23TypeChart";

describe("GEN23_TYPE_CHART", () => {
  it("has exactly the 17 Gen 2-3 types (Dark/Steel included, no Fairy)", () => {
    const types = Object.keys(GEN23_TYPE_CHART);
    expect(types).toHaveLength(17);
    expect(types).toContain("dark");
    expect(types).toContain("steel");
    expect(types).not.toContain("fairy");
    for (const attackingType of types) {
      expect(Object.keys(GEN23_TYPE_CHART[attackingType])).toHaveLength(17);
    }
  });

  it("applies the documented historical deviation: Ghost and Dark are not-very-effective against Steel", () => {
    expect(getGen23TypeEffectiveness("ghost", "steel")).toBe(0.5);
    expect(getGen23TypeEffectiveness("dark", "steel")).toBe(0.5);
  });

  it("does NOT nerf Steel's own offensive moves against Ghost/Dark (a common keying mistake)", () => {
    expect(getGen23TypeEffectiveness("steel", "ghost")).toBe(1);
    expect(getGen23TypeEffectiveness("steel", "dark")).toBe(1);
  });

  it("matches the modern chart for unchanged matchups, including other Steel matchups", () => {
    expect(getGen23TypeEffectiveness("fire", "water")).toBe(0.5);
    expect(getGen23TypeEffectiveness("water", "fire")).toBe(2);
    expect(getGen23TypeEffectiveness("electric", "ground")).toBe(0);
    expect(getGen23TypeEffectiveness("steel", "ice")).toBe(2);
    expect(getGen23TypeEffectiveness("fighting", "steel")).toBe(2);
  });

  it("falls back to neutral for an unknown type pairing", () => {
    expect(getGen23TypeEffectiveness("nottype", "fire")).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run (from `web/`): `npm test -- src/core/gen23TypeChart.test.ts`
Expected: FAIL — `Cannot find module './gen23TypeChart'`.

- [ ] **Step 3: Create `web/src/core/gen23TypeChart.ts`**

```ts
import { TYPE_CHART } from "./typeChart";

const GEN23_TYPES = [
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
  "dark",
  "steel",
] as const;

// Documented historical deviation from the modern (Gen 6+) chart,
// independently verified against a live source during this phase's
// research (see the Phase 3c spec): Steel resisted Ghost- and Dark-type
// moves in Gen 2-5, becoming neutral (1x) from Gen 6 onward. No other
// cell differs — Fairy simply doesn't exist yet (17 types, not 18).
// Keyed by ATTACKING type first (Ghost/Dark are the attackers here),
// matching TYPE_CHART's own convention.
const GEN23_OVERRIDES: Record<string, Record<string, number>> = {
  ghost: { steel: 0.5 },
  dark: { steel: 0.5 },
};

function buildGen23TypeChart(): Record<string, Record<string, number>> {
  const chart: Record<string, Record<string, number>> = {};
  for (const attackingType of GEN23_TYPES) {
    const row: Record<string, number> = {};
    for (const defendingType of GEN23_TYPES) {
      row[defendingType] =
        GEN23_OVERRIDES[attackingType]?.[defendingType] ??
        TYPE_CHART[attackingType][defendingType];
    }
    chart[attackingType] = row;
  }
  return chart;
}

export const GEN23_TYPE_CHART: Record<string, Record<string, number>> = buildGen23TypeChart();

export function getGen23TypeEffectiveness(
  attackingType: string,
  defendingType: string
): number {
  return GEN23_TYPE_CHART[attackingType]?.[defendingType] ?? 1;
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run (from `web/`): `npm test`
Expected: PASS — all new tests, plus every prior test, pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/core/gen23TypeChart.ts web/src/core/gen23TypeChart.test.ts
git commit -m "Add generated Gen 2-3 type chart (17 types, Steel-vs-Ghost/Dark override)"
```

---

### Task 4: Gen 2-3 type-based move category

**Files:**
- Test: `web/src/core/gen23Category.test.ts`
- Create: `web/src/core/gen23Category.ts`

**Interfaces:**
- Produces: `getGen23Category(moveType: string): "physical" | "special"`.

- [ ] **Step 1: Write the failing test file** — `web/src/core/gen23Category.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { getGen23Category } from "./gen23Category";

describe("getGen23Category", () => {
  it("classifies all 8 special-by-type types", () => {
    expect(getGen23Category("fire")).toBe("special");
    expect(getGen23Category("water")).toBe("special");
    expect(getGen23Category("grass")).toBe("special");
    expect(getGen23Category("electric")).toBe("special");
    expect(getGen23Category("ice")).toBe("special");
    expect(getGen23Category("psychic")).toBe("special");
    expect(getGen23Category("dragon")).toBe("special");
    expect(getGen23Category("dark")).toBe("special");
  });

  it("classifies all 9 physical-by-type types", () => {
    expect(getGen23Category("normal")).toBe("physical");
    expect(getGen23Category("fighting")).toBe("physical");
    expect(getGen23Category("flying")).toBe("physical");
    expect(getGen23Category("ground")).toBe("physical");
    expect(getGen23Category("rock")).toBe("physical");
    expect(getGen23Category("bug")).toBe("physical");
    expect(getGen23Category("ghost")).toBe("physical");
    expect(getGen23Category("poison")).toBe("physical");
    expect(getGen23Category("steel")).toBe("physical");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run (from `web/`): `npm test -- src/core/gen23Category.test.ts`
Expected: FAIL — `Cannot find module './gen23Category'`.

- [ ] **Step 3: Create `web/src/core/gen23Category.ts`**

```ts
// Until Gen 4, a move's physical/special category was determined by its
// TYPE, not chosen per move (unlike today's per-move system). This is a
// fixed historical rule, not data sourced from any API — PokeAPI's
// move.damage_class only reflects the current (Gen 4+) per-move category.
const SPECIAL_TYPES = new Set([
  "fire",
  "water",
  "grass",
  "electric",
  "ice",
  "psychic",
  "dragon",
  "dark",
]);

export function getGen23Category(moveType: string): "physical" | "special" {
  return SPECIAL_TYPES.has(moveType) ? "special" : "physical";
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run (from `web/`): `npm test`
Expected: PASS — all new tests, plus every prior test, pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/core/gen23Category.ts web/src/core/gen23Category.test.ts
git commit -m "Add Gen 2-3 type-based move category table"
```

---

### Task 5: Gen 2-3 stage-based critical-hit chance

**Files:**
- Test: `web/src/core/gen23Crit.test.ts`
- Create: `web/src/core/gen23Crit.ts`

**Interfaces:**
- Produces: `getGen23CritChance(generation: 2 | 3, highCritRate: boolean): number`.

Stage tables, independently verified against a live source during this phase's research:

| Stage | Gen 2 | Gen 3 |
|---|---|---|
| 0 | 17/256 | 1/16 |
| 1 | 1/8 | 1/8 |
| 2 | 1/4 | 1/4 |
| 3 | 85/256 | 1/3 |
| 4+ | 1/2 | 1/2 |

A high-crit-ratio move (`MoveData.highCritRate`) adds **+2 stages** in Gen 2, or **+1 stage** in Gen 3, both starting from stage 0 (no other stage-modifying effect — Focus Energy, held items, Super Luck — is modeled anywhere in this app).

- [ ] **Step 1: Write the failing test file** — `web/src/core/gen23Crit.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { getGen23CritChance } from "./gen23Crit";

describe("getGen23CritChance", () => {
  it("Gen 2, non-high-crit-rate move: stage 0 = 17/256", () => {
    expect(getGen23CritChance(2, false)).toBeCloseTo(17 / 256);
  });

  it("Gen 3, non-high-crit-rate move: stage 0 = 1/16", () => {
    expect(getGen23CritChance(3, false)).toBeCloseTo(1 / 16);
  });

  it("Gen 2, high-crit-rate move: +2 stages from 0 = stage 2 = 1/4", () => {
    expect(getGen23CritChance(2, true)).toBeCloseTo(1 / 4);
  });

  it("Gen 3, high-crit-rate move: +1 stage from 0 = stage 1 = 1/8", () => {
    expect(getGen23CritChance(3, true)).toBeCloseTo(1 / 8);
  });

  it("the same highCritRate move has a different chance in Gen 2 vs Gen 3, proving the stage-increment (not just the base table) differs", () => {
    const gen2Chance = getGen23CritChance(2, true);
    const gen3Chance = getGen23CritChance(3, true);
    expect(gen2Chance).not.toBe(gen3Chance);
    expect(gen2Chance).toBeCloseTo(0.25);
    expect(gen3Chance).toBeCloseTo(0.125);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run (from `web/`): `npm test -- src/core/gen23Crit.test.ts`
Expected: FAIL — `Cannot find module './gen23Crit'`.

- [ ] **Step 3: Create `web/src/core/gen23Crit.ts`**

```ts
const GEN2_STAGE_CHANCES = [17 / 256, 1 / 8, 1 / 4, 85 / 256, 1 / 2];
const GEN3_STAGE_CHANCES = [1 / 16, 1 / 8, 1 / 4, 1 / 3, 1 / 2];

export function getGen23CritChance(
  generation: 2 | 3,
  highCritRate: boolean
): number {
  const stages = generation === 2 ? GEN2_STAGE_CHANCES : GEN3_STAGE_CHANCES;
  const stageIncrement = generation === 2 ? 2 : 1;
  const stage = highCritRate ? stageIncrement : 0;
  const clampedStage = Math.min(stage, stages.length - 1);
  return stages[clampedStage];
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run (from `web/`): `npm test`
Expected: PASS — all new tests, plus every prior test, pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/core/gen23Crit.ts web/src/core/gen23Crit.test.ts
git commit -m "Add Gen 2-3 stage-based critical-hit chance calculator"
```

---

### Task 6: Gen 2-3 damage formula

**Files:**
- Test: `web/src/core/gen23Damage.test.ts`
- Create: `web/src/core/gen23Damage.ts`

**Interfaces:**
- Consumes: `getGen23TypeEffectiveness` from `./gen23TypeChart` (Task 3); `getGen23Category` from `./gen23Category` (Task 4); `StatBlock`, `MoveData` from `./types`.
- Produces: `interface DamageRange { min: number; max: number }`, `calculateGen23DamageRange(attackerLevel: number, attackerStats: StatBlock, defenderStats: StatBlock, move: MoveData, attackerTypes: string[], defenderTypes: string[], critical: boolean): DamageRange | null`.

- [ ] **Step 1: Write the failing test file** — `web/src/core/gen23Damage.test.ts`

Every expected value is hand-computed from the formula
(`base = floor(floor(floor(2*Level/5+2) * Power * Atk/Def) / 50) + 2`,
`damage = floor(base * STAB * TypeEff * CritMultiplier * RandomFactor)`
with `RandomFactor` approximated as `0.85`-`1.0` — same simplification
Phase 3a's `damage.ts` already uses — and a 1-HP minimum floor for any
non-immune hit) — see the spec for the worked arithmetic.

```ts
import { describe, it, expect } from "vitest";
import { calculateGen23DamageRange } from "./gen23Damage";
import type { MoveData } from "./types";

const attackerStats = { hp: 150, atk: 100, def: 80, spa: 70, spd: 80, spe: 90 };
const defenderStats = { hp: 150, atk: 80, def: 100, spa: 80, spd: 100, spe: 70 };

describe("calculateGen23DamageRange", () => {
  it("computes a STAB, type-neutral physical-by-type move, non-crit", () => {
    const move: MoveData = {
      name: "tackle",
      type: "normal",
      category: "physical",
      power: 80,
      priority: 0,
      highCritRate: false,
    };
    const result = calculateGen23DamageRange(50, attackerStats, defenderStats, move, ["normal"], ["fighting"], false);
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
    const result = calculateGen23DamageRange(50, attackerStats, defenderStats, move, ["normal"], ["fighting"], true);
    expect(result).toEqual({ min: 94, max: 111 });
  });

  it("uses the special attack/defense stats for a Special-by-type move (fire), non-STAB, super-effective, ignoring move.category", () => {
    const move: MoveData = {
      name: "ember",
      type: "fire",
      // Deliberately WRONG/irrelevant category — Gen 2-3 category is
      // type-derived, not read from MoveData.category, for damage moves.
      category: "physical",
      power: 80,
      priority: 0,
      highCritRate: false,
    };
    const result = calculateGen23DamageRange(50, attackerStats, defenderStats, move, ["water"], ["grass"], false);
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
    const result = calculateGen23DamageRange(50, attackerStats, defenderStats, move, ["normal"], ["normal"], false);
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
    const result = calculateGen23DamageRange(50, attackerStats, defenderStats, move, ["water"], ["ghost"], false);
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
    const result = calculateGen23DamageRange(1, lowStatsAttacker, lowStatsDefender, move, ["normal"], ["grass"], false);
    expect(result).toEqual({ min: 1, max: 1 });
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run (from `web/`): `npm test -- src/core/gen23Damage.test.ts`
Expected: FAIL — `Cannot find module './gen23Damage'`.

- [ ] **Step 3: Create `web/src/core/gen23Damage.ts`**

```ts
import { getGen23TypeEffectiveness } from "./gen23TypeChart";
import { getGen23Category } from "./gen23Category";
import type { StatBlock, MoveData } from "./types";

export interface DamageRange {
  min: number;
  max: number;
}

export function calculateGen23DamageRange(
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

  const category = getGen23Category(move.type);
  const atk = category === "physical" ? attackerStats.atk : attackerStats.spa;
  const def = category === "physical" ? defenderStats.def : defenderStats.spd;

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
git add web/src/core/gen23Damage.ts web/src/core/gen23Damage.test.ts
git commit -m "Add Gen 2-3 damage formula (type-based category, post-hoc crit, 1-HP floor)"
```

---

### Task 7: Gen 2-3 matchup evaluator (orchestrator)

**Files:**
- Test: `web/src/core/gen23Matchup.test.ts`
- Create: `web/src/core/gen23Matchup.ts`

**Interfaces:**
- Consumes: `getHistoricalTypes` from `./gen1Types` (Task 1); `getBaseStats` from `./baseStats` (Phase 3a); `getMoveData` from `./moveData` (Phase 3a); `calculateGen1Stats`, `ivsToDvs`, `evsToStatExp`, `PERFECT_DV`, `ZERO_STAT_EXP` from `./gen1Stats` (Task 2); `calculateStats` from `./stats` (Phase 3a); `calculateGen23DamageRange` from `./gen23Damage` (Task 6); `getGen23CritChance` from `./gen23Crit` (Task 5); `NATURES` from `./natures` (Phase 3a); `StatBlock`, `MoveData` from `./types`.
- Produces: `interface Gen23MatchupInput`, `interface Gen23MatchupResult`, `evaluateGen23Matchup(input: Gen23MatchupInput): Promise<Gen23MatchupResult | null>` — the module a later phase will call directly.

- [ ] **Step 1: Write the failing test file** — `web/src/core/gen23Matchup.test.ts`

The two "exact hand-verified matchup result" tests below are hand-computed
by chaining the Gen 2 branch (Task 2's DV/Stat-Experience formula) or the
Gen 3 branch (Phase 3a's modern IV/EV/nature formula) with Task 5's crit
formula and Task 6's damage formula — see the spec for the worked
arithmetic. Both tests use the SAME base-stat fixtures and the SAME move,
differing only in `generation` (and, deliberately, in `nature`, to prove
Gen 3's nature is genuinely applied and Gen 2's is genuinely ignored) —
this is what proves both branches are actually wired up, not just one of
them with the other silently falling through to the same code path.

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { evaluateGen23Matchup } from "./gen23Matchup";
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

describe("evaluateGen23Matchup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computes an exact hand-verified Gen 2 result (DV/Stat-Experience stats, nature ignored, spd used un-overridden)", async () => {
    setupMocks();

    const result = await evaluateGen23Matchup({
      generation: 2,
      attacker: { species: "Attacker", level: 50, ivs: perfectIvs, evs: zeroEvs, nature: "Hardy" },
      attackerMove: "Psybeam",
      defender: { species: "Defender", level: 50 },
    });

    expect(result).toEqual({
      normal: {
        damageRange: { min: 22, max: 26 },
        hitsToKO: { min: 5, max: 6 },
      },
      criticalHit: {
        chance: 17 / 256,
        damageRange: { min: 44, max: 52 },
        hitsToKO: { min: 3, max: 3 },
      },
      moveOrder: "defender",
    });
  });

  it("computes an exact hand-verified Gen 3 result (modern IV/EV/nature stats, Modest nature genuinely boosting Special Attack)", async () => {
    setupMocks();

    const result = await evaluateGen23Matchup({
      generation: 3,
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

  it("returns null for a status move", async () => {
    setupMocks({
      move: { name: "growl", type: "normal", category: "status", power: null, priority: 0, highCritRate: false },
    });

    const result = await evaluateGen23Matchup({
      generation: 3,
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

    const result = await evaluateGen23Matchup({
      generation: 3,
      attacker: { species: "Attacker", level: 50, ivs: perfectIvs, evs: zeroEvs, nature: "Hardy" },
      attackerMove: "Psybeam",
      defender: { species: "Defender", level: 50 },
    });

    expect(result).toBeNull();
  });

  it("returns null on Gen 3 when the attacker's nature name doesn't match any known nature", async () => {
    setupMocks();

    const result = await evaluateGen23Matchup({
      generation: 3,
      attacker: { species: "Attacker", level: 50, ivs: perfectIvs, evs: zeroEvs, nature: "NotARealNature" },
      attackerMove: "Psybeam",
      defender: { species: "Defender", level: 50 },
    });

    expect(result).toBeNull();
  });

  it("does NOT return null on Gen 2 for the same invalid nature name — Gen 2 ignores nature entirely, so an implementation that validates it on both branches would wrongly fail this", async () => {
    setupMocks();

    const result = await evaluateGen23Matchup({
      generation: 2,
      attacker: { species: "Attacker", level: 50, ivs: perfectIvs, evs: zeroEvs, nature: "NotARealNature" },
      attackerMove: "Psybeam",
      defender: { species: "Defender", level: 50 },
    });

    expect(result).not.toBeNull();
    expect(result).toEqual({
      normal: {
        damageRange: { min: 22, max: 26 },
        hitsToKO: { min: 5, max: 6 },
      },
      criticalHit: {
        chance: 17 / 256,
        damageRange: { min: 44, max: 52 },
        hitsToKO: { min: 3, max: 3 },
      },
      moveOrder: "defender",
    });
  });

  it("returns 'attacker' move order for a positive-priority move even with lower Speed", async () => {
    setupMocks({
      move: { name: "quick-attack", type: "normal", category: "physical", power: 40, priority: 1, highCritRate: false },
    });

    const result = await evaluateGen23Matchup({
      generation: 2,
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

    const result = await evaluateGen23Matchup({
      generation: 3,
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

Run (from `web/`): `npm test -- src/core/gen23Matchup.test.ts`
Expected: FAIL — `Cannot find module './gen23Matchup'`.

- [ ] **Step 3: Create `web/src/core/gen23Matchup.ts`**

```ts
import { getHistoricalTypes } from "./gen1Types";
import { getBaseStats } from "./baseStats";
import { getMoveData } from "./moveData";
import {
  calculateGen1Stats,
  ivsToDvs,
  evsToStatExp,
  PERFECT_DV,
  ZERO_STAT_EXP,
} from "./gen1Stats";
import { calculateStats } from "./stats";
import { calculateGen23DamageRange } from "./gen23Damage";
import { getGen23CritChance } from "./gen23Crit";
import { NATURES } from "./natures";
import type { StatBlock, MoveData } from "./types";

/** `ivs`/`evs` use the MODERN 0-31/0-252 scale. On the Gen 2 branch they
 * are reinterpreted as Gen 1-style DVs/Stat Experience (same approximation
 * `gen1Matchup.ts` uses); on the Gen 3 branch they are used directly,
 * since Gen 3 natively uses this system. `nature` is a nature NAME
 * (looked up via `NATURES.find()`, matching `MatchupAttacker`'s existing
 * convention in `matchup.ts`), ignored entirely on the Gen 2 branch (Gen 2
 * has no natures). */
export interface Gen23MatchupAttacker {
  species: string;
  level: number;
  ivs: StatBlock;
  evs: StatBlock;
  nature: string;
}

/** The defender is always evaluated with the era-appropriate "worst case"
 * convention: Gen 2 uses perfect DVs (15) / zero Stat Experience; Gen 3
 * uses perfect IVs (31) / zero EVs / a neutral nature — fixed conventions
 * for a trainer Pokémon with no roster data, not derived from any input
 * on this type. */
export interface Gen23MatchupDefender {
  species: string;
  level: number;
}

export interface Gen23MatchupInput {
  generation: 2 | 3;
  attacker: Gen23MatchupAttacker;
  attackerMove: string;
  defender: Gen23MatchupDefender;
}

/** `hitsToKO.min`/`.max` can be `Infinity` (e.g. a type-immune matchup)
 * despite the plain `number` type — see gen1Matchup.ts's identical
 * caveat; callers serializing this should be aware `Infinity` serializes
 * to `null` via `JSON.stringify`. */
export interface Gen23MatchupOutcome {
  damageRange: { min: number; max: number };
  hitsToKO: { min: number; max: number };
}

export interface Gen23MatchupResult {
  normal: Gen23MatchupOutcome;
  /** `chance` is a probability in [0, 1], not a percentage. */
  criticalHit: { chance: number } & Gen23MatchupOutcome;
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
): Gen23MatchupOutcome | null {
  const damageRange = calculateGen23DamageRange(
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
 * generation (see `getHistoricalTypes`), or — on the Gen 3 branch only —
 * the attacker's nature name doesn't match any known nature. */
export async function evaluateGen23Matchup(
  input: Gen23MatchupInput
): Promise<Gen23MatchupResult | null> {
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

  let attackerStats: StatBlock;
  let defenderStats: StatBlock;

  if (generation === 2) {
    attackerStats = calculateGen1Stats(
      attackerBase,
      ivsToDvs(attacker.ivs),
      evsToStatExp(attacker.evs),
      attacker.level
    );
    defenderStats = calculateGen1Stats(defenderBase, PERFECT_DV, ZERO_STAT_EXP, defender.level);
  } else {
    const attackerNature = NATURES.find((n) => n.name === attacker.nature);
    if (!attackerNature) return null;
    const neutralNature = NATURES.find((n) => n.name === "Hardy")!;

    attackerStats = calculateStats(
      attackerBase,
      attacker.ivs,
      attacker.evs,
      attackerNature,
      attacker.level
    );
    defenderStats = calculateStats(defenderBase, PERFECT_IVS, ZERO_EVS, neutralNature, defender.level);
  }

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
Expected: PASS — all 8 new tests, plus every prior test, pass.

- [ ] **Step 5: Run the typecheck**

Run (from `web/`): `npx tsc --noEmit`
Expected: clean, no errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/core/gen23Matchup.ts web/src/core/gen23Matchup.test.ts
git commit -m "Add Gen 2-3 matchup evaluator (generation-branching stats, crit, damage)"
```

---

## Self-Review Notes

- **Spec coverage:** the bounded refactor (generalizing `gen1Types.ts`, extracting Gen 1's stat-reinterpretation helpers), the type chart with its one Steel-vs-Ghost/Dark override (correctly keyed by attacking type), the type-based category table, the two-generation crit-stage system, the damage formula (post-hoc crit multiplier, 1-HP floor), and the full orchestrator wiring (generation-branching stats, un-overridden Gen 2 `spd`, string-based nature lookup matching `matchup.ts`'s convention) are all covered. The spec's exclusions (Gen 4-5, authentic Gen 2 DV/StatExp entry, base-stat/move-type historical accuracy beyond species typing, status/weather/items/abilities, UI integration) are correctly absent from every task.
- **Placeholder scan:** none — every step has full file contents or an exact command with an exact expected result.
- **Type consistency:** `getHistoricalTypes(species, generation, options?)` is defined once in Task 1 and consumed identically by `gen1Matchup.ts` (indirectly, via the unchanged `getGen1Types` wrapper) and `gen23Matchup.ts` (directly, in Task 7). `ivsToDvs`/`evsToStatExp`/`PERFECT_DV`/`ZERO_STAT_EXP` are defined once in Task 2 and consumed identically by `gen1Matchup.ts` (updated import) and `gen23Matchup.ts` (Task 7, Gen 2 branch). `calculateGen23DamageRange`'s 7-arg signature (Task 6) matches Task 7's two `outcomeFor` calls exactly. `getGen23CritChance`'s `(generation, highCritRate)` signature (Task 5) matches Task 7's one call site exactly. `Gen23MatchupAttacker.nature: string` matches `NATURES.find((n) => n.name === attacker.nature)` in Task 7 — not a `Nature` object anywhere.
- **Formula accuracy:** every pure-function test fixture (Tasks 3-6) was hand-computed independently and cross-checked against a live source where the underlying fact was historical (type chart, crit stages) rather than pure arithmetic. Task 7's two orchestrator tests each chain a full formula pipeline into one hand-verified end-to-end result, using the SAME base stats and move but different `generation`/`nature` — deliberately structured so a broken generation-branch (e.g. accidentally routing Gen 3 through the Gen 2 stat formula) would fail at least one of the two tests, learning directly from Phase 3b's Task 7 finding where a single fixture didn't actually exercise the thing it claimed to.
