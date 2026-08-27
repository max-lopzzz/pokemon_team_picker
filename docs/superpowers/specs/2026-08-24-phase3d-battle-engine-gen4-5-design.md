# Phase 3d: Battle Engine (Gen 4-5) — Design

## Context

This is the sixth phase of the `pokemon_team_picker` rewrite (see
[Phase 1's spec](2026-08-23-phase1-web-foundation-design.md) for the phase
breakdown, [Phase 3a's spec](2026-08-23-phase3a-battle-engine-gen6-9-design.md)
for the Gen 6-9 battle engine, [Phase 3b's spec](2026-08-23-phase3b-battle-engine-gen1-design.md)
for the Gen 1 engine, and [Phase 3c's spec](2026-08-23-phase3c-battle-engine-gen2-3-design.md)
for the Gen 2-3 engine this phase most closely parallels). This is the
fourth and final battle-engine sub-phase named in Phase 3a's original era
breakdown.

Phase 3a's original era table described Gen 4-5 (Diamond/Pearl/Platinum/
HeartGold/SoulSilver, Black/White/Black 2/White 2) as: "category becomes
per-move (today's system), but crit rates are still on the older stage
table." Researching this phase — independently cross-checking live sources
before writing any code, per the discipline established after Phase 3b's
type-chart research error — confirmed that description and found Gen 4-5
reuses far more of what's already built than any prior sub-phase did:

- **Crit stages**: identical to Gen 3's table (`1/16, 1/8, 1/4, 1/3, 1/2`,
  +1 stage for a high-crit-ratio move) in both Gen 4 and Gen 5. No new
  table needed — `gen23Crit.ts`'s Gen 3 branch already has these exact
  values.
- **Crit multiplier**: 2× (matching Gen 2-3, not modern's 1.5×).
- **Type chart**: identical to Gen 2-3's 17-type chart (Steel resists
  Ghost/Dark; Fairy doesn't exist yet — that changed in Gen 6). No new
  chart needed — `gen23TypeChart.ts` is byte-identical to what this phase
  needs.
- **Move category**: per-move again (`MoveData.category` directly, the
  modern system), unlike Gen 2-3's type-based table.
- **Stats**: the modern IV/EV/nature system (same as Gen 3/6-9) — no
  DV/Stat-Experience branching, and nature is genuinely applied (unlike
  Gen 2).
- **Damage formula shape**: same base term, same 85–100/100 variance
  approximation, same 1-HP minimum floor, crit applied post-hoc — all
  already implemented in Phase 3a's `damage.ts`, which (unlike Gen 2-3's
  equivalent) already reads `move.category` directly rather than deriving
  it from type.

**Gen 4 and Gen 5 are mechanically identical to each other** for every
one of these — there is no genuine Gen 4-vs-Gen 5 branch anywhere in this
phase's mechanics, unlike Gen 2 vs Gen 3's real DV/Stat-Exp split. The
only place `generation` matters at all is species historical typing (a
species' typing could in principle differ between Gen 4 and Gen 5, the
same way it can between any two generations, via `getHistoricalTypes`).

## Decisions carried from discussion

- **No generation-branching orchestrator.** Unlike `gen23Matchup.ts`'s
  two-branch design, `gen45Matchup.ts` has a single code path.
  `generation: 4 | 5` is still a required input field, but it flows to
  exactly one place: `getHistoricalTypes(species, generation)`. Everything
  else (stats, crit, damage, type chart) is identical regardless of which
  of the two generations was passed.
- **Reuse `gen23TypeChart.ts` directly, unchanged.** Its chart is
  byte-identical to what Gen 4-5 needs. `gen45Damage.ts` imports
  `getGen23TypeEffectiveness` directly (with a comment noting it now
  serves Gen 2 through Gen 5) — not worth renaming or wrapping
  already-shipped, already-reviewed Phase 3c code for a purely cosmetic
  gain.
- **Generalize `gen23Crit.ts`'s signature, as a small bounded refactor
  done first** (mirroring every prior phase's precedent of a preparatory
  refactor before new work): `getGen23CritChance(generation: 2 | 3 |
  4 | 5, highCritRate: boolean)`. This is a genuinely load-bearing
  generalization — Gen 3/4/5 share one table, and the existing
  implementation's `generation === 2 ? ... : ...` ternary already routes
  every non-2 value to the shared table with zero logic changes needed,
  only the type signature widens. A regression test proves Gen 3, Gen 4,
  and Gen 5 all return identical values from the same call, and existing
  Gen 2/Gen 3 tests must keep passing unchanged.
- **`gen45Damage.ts` is new but small**: essentially Phase 3a's
  `damage.ts` (which already derives atk/def from `move.category`
  directly) plus a `critical: boolean` parameter (post-hoc ×2, matching
  Gen 2-3's approach — not folded into the level term like Gen 1, not
  1.5× like modern) plus `getGen23TypeEffectiveness` swapped in for the
  18-type modern chart.

## Bounded refactor (prerequisite)

1. **Generalize `gen23Crit.ts`**: widen `getGen23CritChance`'s signature
   from `generation: 2 | 3` to `generation: 2 | 3 | 4 | 5`. The function
   body's `generation === 2 ? GEN2_STAGE_CHANCES : GEN3_STAGE_CHANCES`
   (and the matching stage-increment ternary) requires NO logic change —
   every value other than `2` already falls through to the Gen 3 table,
   which is exactly correct for `3`, `4`, and `5` alike. This is a
   type-signature-only change.
2. Add a new test proving `getGen23CritChance(3, ...)`,
   `getGen23CritChance(4, ...)`, and `getGen23CritChance(5, ...)` all
   return identical values for both `highCritRate` states — a genuine
   equivalence check, not just "trust the refactor."
3. Run the full suite — this refactor must be invisible to every existing
   Gen 2/Gen 3 caller (`gen23Matchup.ts`); their tests are the regression
   check.

## New modules

- **`gen45Damage.ts`** — `web/src/core/gen45Damage.ts`.
  `calculateGen45DamageRange(attackerLevel, attackerStats, defenderStats,
  move, attackerTypes, defenderTypes, critical: boolean): DamageRange |
  null`. Structurally near-identical to `gen23Damage.ts`, with two
  differences: atk/def selection reads `move.category` directly (no
  `getGen23Category` type-based lookup — Gen 4-5 has per-move category),
  and it imports `getGen23TypeEffectiveness` from the existing
  `gen23TypeChart.ts` rather than any new chart module. Same 1-HP floor
  for non-immune hits, same `typeEffectiveness > 0` immunity exception,
  same post-hoc ×2 critical multiplier as Gen 2-3.
- **`gen45Matchup.ts`** — the orchestrator, `web/src/core/gen45Matchup.ts`.
  Parallel to `gen1Matchup.ts`'s and `gen23Matchup.ts`'s
  normal+criticalHit result shape, but with a single code path (no
  generation branch beyond the one `getHistoricalTypes` call).

## `Gen45MatchupInput`/`Gen45MatchupResult`

```ts
export interface Gen45MatchupAttacker {
  species: string;
  level: number;
  ivs: StatBlock;
  evs: StatBlock;
  nature: string; // a real nature, genuinely applied via calculateStats —
    // unlike Gen 2, matching MatchupAttacker's existing string convention.
}

export interface Gen45MatchupDefender {
  species: string;
  level: number;
}

export interface Gen45MatchupInput {
  generation: 4 | 5;
  attacker: Gen45MatchupAttacker;
  attackerMove: string;
  defender: Gen45MatchupDefender;
}

export interface Gen45MatchupOutcome {
  damageRange: { min: number; max: number };
  hitsToKO: { min: number; max: number };
}

export interface Gen45MatchupResult {
  normal: Gen45MatchupOutcome;
  criticalHit: { chance: number } & Gen45MatchupOutcome; // chance in [0, 1]
  moveOrder: "attacker" | "defender" | "tie";
}

function evaluateGen45Matchup(input: Gen45MatchupInput): Promise<Gen45MatchupResult | null>;
```

`evaluateGen45Matchup`:
1. Fetches (in parallel): `getHistoricalTypes(species, generation)` for
   both Pokémon, `getBaseStats` for both, `getMoveData` for the move —
   same pattern as every prior orchestrator.
2. Returns `null` if any lookup fails, or the move is a status move.
3. Looks up the attacker's nature by name via `NATURES.find()` (returning
   `null` if not found, matching `matchup.ts`'s and `gen23Matchup.ts`'s
   Gen 3-branch convention); the defender uses the established trainer
   convention — perfect IVs (31), zero EVs, neutral ("Hardy") nature.
4. Computes both Pokémon's stats via Phase 3a's `calculateStats`
   (identical for both Gen 4 and Gen 5 — no branching).
5. Computes a normal and a critical damage range via `gen45Damage.ts`,
   each with their own `hitsToKO`.
6. Computes crit chance via the generalized
   `getGen23CritChance(generation, move.highCritRate)`.
7. Computes move order the same way every prior orchestrator does
   (priority, then Speed, `"tie"` on an exact tie).

`hitsToKO.min`/`.max` can be `Infinity`, documented via JSDoc on the
interfaces directly (the precedent Phase 3b's final review established).

## Error handling

Same graceful-degradation contract as every prior phase: any failed
lookup, a status move, an unresolvable historical typing, or an unknown
nature name → `null`, never a throw.

## Testing

- `gen23Crit.ts` (generalized): existing Gen 2/Gen 3 tests unchanged; new
  test proving `getGen23CritChance(3, h)`, `(4, h)`, and `(5, h)` are all
  equal for both `h` values.
- `gen45Damage.ts`: TDD with hand-computed reference values for a normal
  hit, a critical hit (proving the post-hoc ×2, not level-term folding),
  a status move, a true type immunity (`{min:0,max:0}`, un-floored), and
  a case confirming the 1-HP floor applies for a non-immune near-zero
  hit.
- `gen45Matchup.ts`: one full hand-verified integration test chaining
  stats + crit + damage together, plus a second test using
  `generation: 4` vs `generation: 5` with mocked historical-typing
  results that genuinely differ between the two calls, proving the
  `generation` field actually reaches the typing lookup and isn't
  silently ignored or hardcoded — directly applying the lesson from
  Phase 3c's final review, which caught exactly this class of untested
  wiring for its own `generation` field.

## Out of scope (deferred)

- Any further battle-engine sub-phases — this is the last one named in
  Phase 3a's original era breakdown. Phase 4 (the team-recommendation
  algorithm consuming all four battle engines) is next.
- Authentic historical base-stat/move-type accuracy beyond species
  typing (same known, documented approximation as every prior phase —
  PokeAPI's current values are used as-is).
- Status conditions, weather, held items, abilities (same as every prior
  phase — no data exists for any of this in this app).
- Any UI/route integration — this phase, like 3a/3b/3c, is a pure
  library consumed by Phase 4.
