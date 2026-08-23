# Phase 3a: Battle Engine (Gen 6-9) — Design

## Context

This is the third phase of the `pokemon_team_picker` rewrite (see
[Phase 1's spec](2026-08-23-phase1-web-foundation-design.md) for the overall
phase breakdown, [Phase 2's spec](2026-08-23-phase2-roster-input-design.md)
for the roster data this phase consumes). Phase 1 shipped the app skeleton
and gym-leader browsing; Phase 2 shipped roster input (species, level,
nature, ability, full IVs/EVs, moveset) stored in `roster.db`.

Phase 3 is "the battle engine": a pure TypeScript damage-calculator /
matchup-evaluator that Phase 4's recommendation algorithm will use to score
a roster Pokémon's move against a gym leader's Pokémon.

**Pokémon's actual battle mechanics are not one ruleset — they're at least
four, split by generation:**

| Era | Games | What's different |
|---|---|---|
| Gen 1 | Red/Blue/Green/Yellow | No Special Attack/Defense split (one "Special" stat); a distinct critical-hit formula (based on base Speed); its own type chart |
| Gen 2-3 | Gold/Silver/Crystal, Ruby/Sapphire/Emerald/FireRed/LeafGreen | Special split introduced, but a move's category (physical/special) is determined by its *type*, not the individual move; older stage-based crit table |
| Gen 4-5 | Diamond/Pearl/Platinum/HGSS, Black/White/B2W2 | Category becomes per-move (today's system), but crit rates are still on the older stage table |
| Gen 6-9 | X/Y onward | Today's mechanics: flat crit rate, 1.5× crit multiplier, the modern 18-type chart (Fairy added, Steel loses some resistances) |

Building all four in one phase is too much to design, implement, and review
at once. **This spec covers only Gen 6-9** (the most recent, least quirky
era, covering X/Y through Scarlet/Violet). Gen 1, Gen 2-3, and Gen 4-5 are
separate follow-up phases (3b, 3c, 3d), each with their own spec/plan.

## Scope of this phase

A framework-free `matchup.ts` module: given one of your roster Pokémon, one
of its moves, and a gym leader's Pokémon (species + level, from
`gym_leaders.db`), compute a damage range, hits-to-KO range, and move order
— using Gen 6-9 mechanics. No UI, no integration into the app's pages —
those come with Phase 4, which will call this module directly. No scoring
or team-selection logic — this phase produces raw building blocks, Phase 4
decides how to weigh them.

## Decisions carried from earlier discussion

- **Trainer Pokémon stats**: `gym_leaders.db` has no IVs/EVs/nature for gym
  leader Pokémon. The engine assumes perfect IVs (31 in every stat), 0 EVs,
  and a neutral nature for every trainer Pokémon.
- **Critical hits**: excluded from the damage range. They're a ~4.2%
  probabilistic event (Gen 6-9 base crit rate is 1/24); modeling them would
  turn a clean min/max range into a probability distribution for marginal
  value to a recommendation tool.
- **Status conditions, weather, held items**: out of scope. None of this
  data exists anywhere in the app (roster doesn't store items; there's no
  weather/status concept at all).
- **Terastallization**: not modeled. `gym_leaders.db` has no Tera-type
  column for Scarlet/Violet gym leaders, so there's no data to model it
  from.
- **Dynamax/Gigantamax**: modeled, but HP-boost only. The real HP boost
  depends on a "Dynamax Level" stat (0-10, giving +50% to +100% HP) that
  isn't stored anywhere — `gym_leaders.db`'s `Dynamax` column is just a
  flag. The engine assumes Dynamax Level 0 (+50% HP) for any Pokémon
  flagged `"Dynamax"` or `"Gigantamax"`. Two other stray values in that
  column (`"Icy Rock"`, `"Chople Berry"` — held items that leaked into the
  wrong column in the original data) are treated as "not Dynamaxed."
  **Max Move power conversion is explicitly out of scope** — the exact
  base-power conversion table couldn't be verified against a reliable
  source, so a Dynamaxed Pokémon's moves keep their normal power/type/
  category. This is a documented simplification, not an oversight.

## New modules

All framework-free, in `web/src/core/` (flat, matching Phase 1/2's
existing layout — no new subdirectory for a ~7-file addition):

- **`typeChart.ts`** — static Gen 6-9 type-effectiveness data (18 types).
  **Generated, not hand-typed**: a one-time script reads the repo's
  existing `typechart.csv` (already verified to be the modern, post-Fairy
  chart — confirmed by checking known modern-only values like Steel-vs-
  Ghost/Dark being neutral rather than resisted) and emits this file, the
  same pattern Phase 1 used for `gym_leaders.db`. This avoids hand-
  transcribing 324 data points.
- **`baseStats.ts`** — PokeAPI-backed base-stat fetch + disk cache.
  `getBaseStats(species): Promise<StatBlock | null>`. New: Phase 1's
  `pokeapi.ts` never fetched base stats, only types/abilities/sprite.
  Independently re-fetches `/pokemon/{species}` (same deliberate
  isolation-over-one-fewer-request trade-off Phase 2's `movelearn.ts`
  made), using the same `toApiSlug` normalization `pokeapi.ts` exports.
- **`moveData.ts`** — PokeAPI-backed move data fetch + cache.
  `getMoveData(moveName): Promise<MoveData | null>` returning
  `{ type, category, power, priority }` (`power` is `null` for status
  moves).
- **`stats.ts`** — pure stat calculator: base stats + IVs/EVs/nature/level
  → final stats. `calculateStats(base: StatBlock, ivs: StatBlock, evs: StatBlock, nature: Nature, level: number): StatBlock`.
  Used for both roster Pokémon (real IV/EV/nature) and trainer Pokémon
  (the assumed-perfect-IV/0-EV/neutral-nature defaults, applied by the
  caller before invoking this function — `stats.ts` itself has no opinion
  about who the numbers belong to).
- **`dynamax.ts`** — `applyDynamaxHp(hp: number, dynamaxState: string | null): number`,
  a one-function module: `+50%` (floor) if the state is `"Dynamax"` or
  `"Gigantamax"`, unchanged otherwise (including the two stray non-Dynamax
  values noted above).
- **`damage.ts`** — the pure damage-range formula, no I/O:
  `calculateDamageRange(attackerStats, defenderStats, move, attackerTypes, defenderTypes): { min: number; max: number }`.
- **`matchup.ts`** — the orchestrator, the module Phase 4 will actually
  call: resolves both Pokémon's stats (via `baseStats.ts` + `stats.ts` +
  `dynamax.ts`) and the move's data (via `moveData.ts`), then calls
  `damage.ts` and computes hits-to-KO and move order.
  `evaluateMatchup(input: MatchupInput): Promise<MatchupResult | null>`
  (see Data Flow below for the exact shape).

## Formulas

**Stat calculation** (standard since Gen 3, unchanged through Gen 9):

```
HP    = floor(((2×Base + IV + floor(EV/4)) × Level) / 100) + Level + 10
Other = floor((floor(((2×Base + IV + floor(EV/4)) × Level) / 100) + 5) × NatureMultiplier)
```

`NatureMultiplier` is 1.1 for a boosted stat, 0.9 for a hindered stat, 1.0
otherwise (from `natures.ts`, already built in Phase 2).

**Damage formula** (Gen 6-9):

```
base  = floor(floor(floor(2×Level/5 + 2) × Power × Atk/Def) / 50) + 2
damage = floor(base × STAB × TypeEffectiveness × RandomFactor)
```

- `Atk`/`Def` are the attacker's/defender's Attack or Special Attack /
  Defense or Special Defense stat, chosen by the move's `category`
  (physical vs. special; status moves are not evaluated by this engine —
  `evaluateMatchup` returns `null` for a status move, since there's no
  damage to range).
- `STAB` = 1.5 if the move's type is one of the attacker's types, else 1.
- `TypeEffectiveness` = the product of the type-chart lookup for the
  move's type against each of the defender's types (0, 0.5, 1, or 2 each;
  a dual-type defender multiplies both, giving possible combined values
  of 0, 0.25, 0.5, 1, 2, or 4).
- `RandomFactor` ranges from 0.85 (min roll) to 1.00 (max roll) in the
  real game, in steps of 1/100. The damage **range** is
  `{ min: floor(base × STAB × TypeEff × 0.85), max: floor(base × STAB × TypeEff × 1.00) }`.

**Documented simplification on rounding order:** the real games floor
after each individual modifier is applied (STAB, then each type
multiplier, then the random factor) rather than combining all modifiers
and flooring once. This implementation floors once, after combining STAB
× TypeEffectiveness × RandomFactor. This can differ from the in-game value
by at most 1 HP point in rare cases — an accepted trade-off; implementing
bit-exact modifier-by-modifier flooring adds real complexity for a
correction smaller than the engine's other simplifications (no crits, no
items) already introduce.

**Hits to KO:**

```
hitsToKO = { min: ceil(defenderMaxHp / damageRange.max), max: ceil(defenderMaxHp / damageRange.min) }
```

Using `defenderMaxHp` after `dynamax.ts`'s HP adjustment, if applicable.

**Move order:** compare the attacker's move's `priority` (from
`moveData.ts`) against an assumed defender priority of 0 (the defender's
actual move for a given turn isn't known — modeling the opponent's move
selection is out of scope; this evaluates "does my chosen move go first
against a normal-priority response"). If priorities are equal, compare
Speed stats (computed via `stats.ts` for both sides, applying the
Gen-6-9-standard formula and each side's assumed nature/IV/EV set). Result
is `"attacker" | "defender" | "tie"` — an exact Speed tie is returned as
`"tie"` rather than resolved via non-deterministic randomness, since this
is meant to be a pure, deterministic function.

## Data Flow

```ts
interface MatchupInput {
  attacker: {
    species: string;
    level: number;
    nature: string;   // one of natures.ts's 25 names
    ivs: StatBlock;
    evs: StatBlock;
  };
  attackerMove: string;
  defender: {
    species: string;
    level: number;
    dynamaxState: string | null; // the raw `Dynamax` column value, or null
  };
}

interface MatchupResult {
  damageRange: { min: number; max: number }; // raw HP points dealt
  hitsToKO: { min: number; max: number };
  moveOrder: "attacker" | "defender" | "tie";
}

function evaluateMatchup(input: MatchupInput): Promise<MatchupResult | null>;
```

`evaluateMatchup` returns `null` when: the move is a status move (no
damage to range), either species' base stats can't be resolved via
PokeAPI, or the move's data can't be resolved via PokeAPI — all graceful-
degradation cases, matching Phase 1/2's established pattern of returning
`null` rather than throwing.

Internally, `evaluateMatchup`:
1. Fetches attacker + defender base stats (`baseStats.ts`) and the move's
   data (`moveData.ts`) in parallel.
2. If the move is a status move or any fetch failed, returns `null`.
3. Computes attacker stats via `stats.ts` (real roster IVs/EVs/nature).
4. Computes defender stats via `stats.ts` (perfect IVs, 0 EVs, neutral
   nature), then applies `dynamax.ts`'s HP adjustment.
5. Computes the damage range via `damage.ts`, using the move's type and
   category, and both Pokémon's types (fetched via Phase 1's existing
   `getSpeciesInfo`, which already returns `types: string[]`).
6. Computes hits-to-KO from the damage range and the defender's
   (Dynamax-adjusted) max HP.
7. Computes move order from the move's priority and both sides' Speed
   stats.

## Error handling

- Any PokeAPI lookup failure (species or move) → `evaluateMatchup` returns
  `null`. No partial results — a matchup evaluation is meaningful only
  with complete data.
- A status move → `evaluateMatchup` returns `null` (documented, not an
  error path — `moveData.ts` distinguishes `category: "status"` from
  physical/special).
- `typeChart.ts` has a lookup for every one of the 18 types by
  construction (generated from a complete source table) — no runtime
  "unknown type" case is expected, but a missing lookup falls back to a
  neutral (1×) multiplier rather than throwing, consistent with graceful
  degradation elsewhere.

## Testing

- `typeChart.ts`: a generated file, verified by a test that spot-checks
  known values against the source `typechart.csv` (e.g. Fire vs. Water =
  0.5, Electric vs. Ground = 0, Steel vs. Steel = 0.5) plus a completeness
  check (all 18×18 = 324 pairs present).
- `stats.ts`: pure function, TDD with hand-verified reference values (e.g.
  a level 100 Pokémon with known base stats/IVs/EVs/nature has a
  well-documented expected final stat — cross-checked against a public
  stat calculator's worked example).
- `damage.ts`: pure function, TDD with a hand-verified reference damage
  calculation (a well-known example matchup with published expected
  min/max damage).
- `dynamax.ts`: pure function, trivial TDD (the three flag values → HP
  multiplier, the two stray values → unchanged).
- `baseStats.ts` / `moveData.ts`: same mocked-`fetch` + temp-cache-dir
  pattern as Phase 1's `pokeapi.ts` and Phase 2's `movelearn.ts` — no real
  network calls in automated tests.
- `matchup.ts`: the orchestrator, tested with all four fetch-backed
  dependencies mocked (species info, base stats, move data) so the test
  suite stays deterministic and fast; verifies the null-return paths
  (status move, failed lookup) and one full worked example matching a
  hand-computed expected `MatchupResult`.

## Out of scope (deferred)

- Gen 1, Gen 2-3, Gen 4-5 formula variants (Phases 3b/3c/3d).
- Critical hits, status conditions, weather, held items, abilities'
  damage-modifying effects.
- Terastallization.
- Max Move power conversion (HP boost only is modeled).
- Modeling which move the defending trainer's AI will actually choose.
- Any UI or app-route integration — this phase is a pure library, wired
  into the app by Phase 4.
