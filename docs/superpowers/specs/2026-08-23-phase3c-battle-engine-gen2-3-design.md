# Phase 3c: Battle Engine (Gen 2-3) — Design

## Context

This is the fifth phase of the `pokemon_team_picker` rewrite (see
[Phase 1's spec](2026-08-23-phase1-web-foundation-design.md) for the phase
breakdown, [Phase 3a's spec](2026-08-23-phase3a-battle-engine-gen6-9-design.md)
for the Gen 6-9 battle engine, and [Phase 3b's spec](2026-08-23-phase3b-battle-engine-gen1-design.md)
for the Gen 1 battle engine this phase most closely parallels in structure).

Phase 3a's original era table grouped Gold/Silver/Crystal (Gen 2) and
Ruby/Sapphire/Emerald/FireRed/LeafGreen (Gen 3) together as "Gen 2-3,"
noting two shared quirks: a move's category (physical/special) is
determined by its *type*, not the individual move (unlike today's
per-move system), and critical hits use an older stage-based table. Both
are true and are this phase's core focus. But `gym_leaders.db` tracks Gen
2 and Gen 3 as separate games, and researching this phase surfaced a real
difference the original table didn't capture: **Gen 2 still uses Gen 1's
DV/Stat-Experience stat system (no natures); Gen 3 introduced the modern
IV/EV/nature system** this app already uses for Gen 6-9. The crit-stage
probabilities also differ slightly between the two generations. This spec
covers both games as one phase — they share enough (type-based category,
the damage formula's shape, the type chart, the historical-typing
problem) that splitting them into separate phases would mean rebuilding
the same scaffolding twice — but the orchestrator branches internally by
generation for the handful of things that don't match.

## Decisions carried from discussion

- **One phase, generation-branching orchestrator**: rather than two
  separate phases (Gen 2 alone, Gen 3 alone) or ignoring the DV/Stat-Exp
  vs IV/EV split, `gen23Matchup.ts` takes an explicit `generation: 2 | 3`
  field and picks the correct stat calculator, crit-stage table, and
  crit-stage increment per call. Everything else (damage formula shape,
  type-based category, type chart, historical typing) is shared.
- **Critical hits are modeled** (matching Phase 3b's precedent, unlike
  Phase 3a's exclusion). Gen 2-3's stage-based crit system is
  well-documented and reuses the existing `MoveData.highCritRate` field
  with no new data dependency.
- **Move category is type-determined, not per-move**: until Gen 4, a
  move's physical/special category was fixed by its *type*, not chosen
  per move (this is why old Dark-type physical attackers like Tyranitar
  historically used their Special Attack stat, not their Attack stat — a
  frequently-surprising piece of Pokémon trivia this phase's data has to
  get right). A hardcoded type→category table drives this, since
  PokeAPI's `move.damage_class` only reflects the *current* (Gen 4+)
  per-move category and has no historical equivalent field (unlike
  `past_types`).
- **Type chart deviation, independently verified**: cross-checked live
  against Bulbapedia during this phase's research (not asserted from
  general knowledge, learning from Phase 3b's ice/fire research error).
  The only documented difference between the Gen 2-5 type chart and the
  modern (Gen 6-9) chart is that Steel resisted Ghost- and Dark-type
  moves in Gen 2-5 (0.5×), becoming neutral (1×) from Gen 6 onward — no
  other cell differs, and Fairy simply doesn't exist yet (17 types, not
  18). This also independently corroborates Phase 3b's Gen 1 chart: the
  same source's Gen I→II changelog exactly matches Phase 3b's shipped
  `GEN1_OVERRIDES` (bug↔poison, ghost→psychic/ghost, ice→fire).
- **Damage formula, independently verified**: also cross-checked live.
  Gen 2 and Gen 3 both use the same base-term shape Phase 3a's `damage.ts`
  already implements (`floor(floor(2×Level/5+2)×Power×A/D)/50)+2`), the
  same 85–100/100 random-damage variance (approximated the same way
  `damage.ts` already does, as a continuous `0.85`–`1.0` multiplier
  range rather than simulating discrete integer rolls), and the same
  1-HP minimum-damage floor for non-immune hits — all **unlike** Gen 1,
  which folds crit into the level term and has no floor at all. The one
  new element is the critical-hit multiplier: applied as a **post-hoc**
  ×2 multiplier on the final damage (matching Gen 3+ and modern
  behavior), not folded into the level term the way Gen 1 does it.
- **Bounded refactor first**: two pieces of Phase 3b's already-shipped
  code generalize cleanly to serve this phase without duplication —
  `gen1Types.ts`'s `past_types`-selection logic (generalizes from
  "earliest entry" to "entry covering generation N," for any N — see
  below), and `gen1Matchup.ts`'s private DV/Stat-Experience
  reinterpretation helpers (`ivsToDvs`, `evsToStatExp`,
  `PERFECT_DV`/`ZERO_STAT_EXP`), which Gen 2's stat branch needs exactly
  as-is. Both refactors are done first, as a small bounded change with
  their own test-suite-unchanged verification, before this phase's new
  modules are built on top of them — mirroring the `apiCache.ts`
  refactor that preceded Phase 3b.

## Bounded refactor (prerequisite)

1. **Generalize `gen1Types.ts`**: rename the exported function's
   selection rule from "the `past_types` entry literally named
   `generation-i`" (already corrected in Phase 3b's final review to mean
   "the chronologically earliest entry") to a new
   `getHistoricalTypes(species: string, generation: number, options?): Promise<string[] | null>`.
   `past_types[].generation` names *the last generation a typing held*;
   the correct typing for a target generation `G` is the entry with the
   smallest generation number that is `>= G` (the first checkpoint not
   yet superseded by `G`), falling back to current types if none
   qualifies. For `G = 1` this is provably identical to "the earliest
   entry" (every entry's generation is trivially `>= 1`), so this is a
   pure generalization with no behavior change for Gen 1. Keep a thin
   wrapper — `getGen1Types(species, options?)` calling
   `getHistoricalTypes(species, 1, options)` — so `gen1Matchup.ts`'s
   import doesn't need to change. The Dark/Steel/Fairy validation guard
   (added in Phase 3b's final review) generalizes too: it should reject
   any type not valid *as of the target generation* (Gen 2-3 adds
   Dark/Steel to the valid set; Fairy stays invalid through Gen 5).
2. **Extract Gen 1 stat-reinterpretation helpers**: move `ivsToDvs`,
   `evsToStatExp`, `PERFECT_DV`, `ZERO_STAT_EXP` out of `gen1Matchup.ts`
   (currently private) into `gen1Stats.ts` as named exports. Update
   `gen1Matchup.ts`'s import accordingly.
3. Run the full suite after both changes — this refactor must be
   invisible from the outside; Phase 3b's existing tests are the
   regression check.

## New modules

All in `web/src/core/`, prefixed `gen23`:

- **`gen23TypeChart.ts`** — generated the same way `gen1TypeChart.ts` is:
  derives from the already-verified modern `TYPE_CHART`, dropping the
  `fairy` row/column (17×17 = 289 pairs) and applying one override:
  `steel: { ghost: 0.5, dark: 0.5 }`.
  `getGen23TypeEffectiveness(attackingType, defendingType): number`.
- **`gen23Category.ts`** — a hardcoded type→category table (this is a
  fixed historical rule, not data from any API):
  - Special: `fire, water, grass, electric, ice, psychic, dragon, dark`
  - Physical: `normal, fighting, flying, ground, rock, bug, ghost,
    poison, steel`
  `getGen23Category(moveType: string): "physical" | "special"`. Status
  moves are identified via `MoveData.category === "status"` before this
  table is ever consulted — the table only covers moves that deal
  damage.
- **`gen23Crit.ts`** — stage-based crit chance, cross-checked live
  against Bulbapedia:

  | Stage | Gen 2 | Gen 3 |
  |---|---|---|
  | 0 | 17/256 | 1/16 |
  | 1 | 1/8 | 1/8 |
  | 2 | 1/4 | 1/4 |
  | 3 | 85/256 | 1/3 |
  | 4+ | 1/2 | 1/2 |

  A high-crit-ratio move (`MoveData.highCritRate`) adds **+2 stages** in
  Gen 2, or **+1 stage** in Gen 3 (both starting from stage 0, since no
  other stage-modifying effect — Focus Energy, held items, Super Luck —
  is modeled anywhere in this app). Crit damage multiplier is 2× in both
  generations (unlike the stage table, this doesn't differ).
  `getGen23CritChance(generation: 2 | 3, highCritRate: boolean): number`.
- **`gen23Damage.ts`** — structurally close to Phase 3a's `damage.ts`
  (same base term, same 0.85–1.0 variance approximation, same 1-HP
  floor for non-immune hits), with three differences: category comes
  from `gen23Category.ts` instead of `move.category`, type effectiveness
  from `gen23TypeChart.ts`, and a `critical: boolean` parameter applying
  a post-hoc ×2 multiplier to both `min` and `max` before the floor is
  applied.
  `calculateGen23DamageRange(attackerLevel, attackerStats, defenderStats, move, attackerTypes, defenderTypes, critical: boolean): DamageRange | null`.
- **`gen23Matchup.ts`** — the orchestrator, parallel to `gen1Matchup.ts`
  but with a `generation: 2 | 3` branch:
  - **Species typing**: `getHistoricalTypes(species, generation)` for
    both Pokémon — this also correctly resolves species whose typing
    changed *after* Gen 3 (e.g. any future Fairy-retcon-style case),
    since the selection rule is "the entry covering generation N," not
    specific to Gen 1's original "earliest entry" case.
  - **Stats — Gen 2**: reuses `gen1Stats.ts`'s `calculateGen1Stats` with
    the newly-exported `ivsToDvs`/`evsToStatExp` reinterpretation (same
    approximation Phase 3b documented — modern roster IV/EV values
    reinterpreted as DV/Stat Experience). Nature is ignored (Gen 2 has
    none). Unlike Gen 1, there is **no** single-"Special"-stat override —
    Gen 2 already split Special Attack/Special Defense, so
    `attackerBase.spa`/`.spd` are used directly, un-overridden.
  - **Stats — Gen 3**: reuses Phase 3a's `calculateStats` (modern
    IV/EV/nature formula) directly — Gen 3 natively uses this system, no
    reinterpretation needed. The attacker's roster `nature` is passed
    through; the defender (a trainer Pokémon with no roster data) uses a
    neutral nature, matching Phase 3a's existing trainer convention.
  - **Category & type effectiveness**: `gen23Category.ts` +
    `gen23TypeChart.ts`, both generation-independent within this phase
    (Gen 2 and Gen 3 share the same category table and type chart).
  - **Crit chance**: `gen23Crit.ts` with the `generation` field and
    `move.highCritRate`.
  - **Move order**: identical logic to `gen1Matchup.ts`/`matchup.ts`
    (priority, then Speed, `"tie"` on an exact tie) — no changes needed.

## `Gen23MatchupInput`/`Gen23MatchupResult`

```ts
export interface Gen23MatchupAttacker {
  species: string;
  level: number;
  ivs: StatBlock; // Gen 2: reinterpreted as DVs. Gen 3: used directly.
  evs: StatBlock; // Gen 2: reinterpreted as Stat Experience. Gen 3: used directly.
  nature: Nature; // ignored on the Gen 2 branch
}

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

export interface Gen23MatchupOutcome {
  damageRange: { min: number; max: number };
  hitsToKO: { min: number; max: number };
}

export interface Gen23MatchupResult {
  normal: Gen23MatchupOutcome;
  criticalHit: { chance: number } & Gen23MatchupOutcome; // chance in [0, 1]
  moveOrder: "attacker" | "defender" | "tie";
}

function evaluateGen23Matchup(input: Gen23MatchupInput): Promise<Gen23MatchupResult | null>;
```

`hitsToKO.min`/`.max` can be `Infinity` (type immunity), same caveat as
`gen1Matchup.ts` — documented via JSDoc on the interfaces themselves,
following the precedent Phase 3b's final review established, not
discovered by a later review this time.

## `MoveData` extension

None needed — `highCritRate` already exists (added in Phase 3b), and this
phase needs no new fields.

## Error handling

Same graceful-degradation contract as Phases 3a/3b: any failed
species/move lookup, a status move, or an unresolvable historical typing
→ `null`, never a throw.

## Testing

- `gen1Types.ts` → `getHistoricalTypes` generalization: existing Phase 3b
  tests must keep passing unchanged (behavioral regression check); add
  new cases for `generation=2`/`generation=3` targets, including a
  species whose typing changed between Gen 3 and Gen 6 (proving the
  target-generation selection, not just "earliest," is correctly
  implemented) and a Gen-2/3-introduced species with a Dark or Steel
  type (proving the validity-guard's valid-type set is generation-aware,
  not hardcoded to Gen 1's 15).
- `gen23TypeChart.ts`: generated-file test mirroring Phase 3a's/3b's —
  spot-check the Steel override plus several unchanged values, confirm
  17×17 = 289 total pairs.
- `gen23Category.ts`: TDD covering every one of the 17 types' category,
  both from the special list and the physical list.
- `gen23Crit.ts`: TDD, hand-computed chance for both generations, at
  stage 0 and with `highCritRate` (proving the +2/+1 stage difference
  actually changes the returned chance between generations).
- `gen23Damage.ts`: TDD with hand-computed reference values for a normal
  hit, a critical hit (proving the post-hoc ×2 — not a level-term fold),
  and a case confirming the 1-HP floor applies (unlike Gen 1's
  equivalent case).
- `gen23Matchup.ts`: two full hand-verified integration tests — one for
  `generation: 2` (proving the DV/Stat-Exp branch and the un-overridden
  `spd` are both actually engaged) and one for `generation: 3` (proving
  the modern IV/EV/nature branch is engaged) — not one fixture reused
  across both, learning directly from Phase 3b's Task 7 finding where a
  single fixture didn't actually exercise the thing it claimed to.

## Out of scope (deferred)

- Gen 4-5 mechanics (Phase 3d).
- Authentic DV/Stat-Experience entry in the roster UI for Gen 2 (same
  accepted approximation as Phase 3b).
- Base-stat/move-type/move-power historical accuracy beyond species
  typing (same known approximation documented in Phase 3b's spec —
  PokeAPI's current values are used as-is; `past_values` on moves and
  pre-Gen-6 base-stat buffs are not modeled).
- Status conditions, weather, held items, abilities (same as every prior
  phase — no data exists for any of this in this app).
- Any UI/route integration — this phase, like 3a/3b, is a pure library
  consumed by Phase 4.
