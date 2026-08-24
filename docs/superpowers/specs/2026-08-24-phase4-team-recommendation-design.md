# Phase 4: Team Recommendation — Design

## Context

This is the seventh phase of the `pokemon_team_picker` rewrite, and the
first to consume Phase 3's battle engines rather than build them. Given a
user's roster (Phase 2) and a gym leader encounter (browsable since Phase
1), it recommends up to 6 roster Pokémon — each with a specific move — to
field against that encounter's team.

The original Python CLI never actually implemented this; `main.py` was
empty when the project was rewritten. The only prior description was an
aspiration in the README: "a program that analyzes the user's available
Pokémon and suggests a team of the best six Pokémon... to combat the
chosen gym leader effectively. This would involve calculations to
determine type advantages, levels, and abilities." Phase 1's own spec
flagged the algorithm as "to be designed in that phase," suggesting only
that full combinatorial search isn't tractable and a heuristic (e.g.
greedy matchup-coverage) would be needed. This spec is that design — a
genuine green field, not a reverse-engineering of prior behavior.

**A structural fact that shapes this whole phase**: the four battle
engines built in Phase 3 don't share one interface. `matchup.ts` (Gen
6-9) returns a flat `MatchupResult { damageRange, hitsToKO, moveOrder }`
with no critical-hit modeling — a deliberate Phase 3a scope decision.
`gen1Matchup.ts`, `gen23Matchup.ts`, and `gen45Matchup.ts` all return
`{ normal, criticalHit, moveOrder }`. `gen23Matchup.ts` and
`gen45Matchup.ts` additionally take a `generation` discriminant, since
each covers two generations. `gen1Matchup.ts`'s attacker interface has no
`nature` field at all (Gen 1 predates natures); the other three do. This
phase's first job is a normalizing adapter that flattens all four into
one shape the scoring logic can treat uniformly.

## Decisions carried from discussion

- **Scope**: recommend a full team (up to 6 roster Pokémon, each with one
  recommended move) for one specific gym encounter — not a per-opponent
  counter-finder, not a bare matchup-comparison tool. Team size follows
  the opponent's team size (capped at 6), not always maxed to 6.
- **Matchup "win" condition**: speed-priority KO race. You win a matchup
  if you move first (or tie) and your hits-to-KO is at most theirs — not
  a strict binary win/loss, but a continuous score so close calls still
  rank sensibly against each other.
- **Opponent's move choice**: for computing whether your Pokémon
  survives, assume the gym leader's Pokémon uses whichever of its actual
  moves (from `encounter_pokemon_moves` — real data, not a guess) is most
  threatening against your specific Pokémon, not just its first-listed
  move. Safer default for a recommendation tool.
- **Critical hits**: scoring uses only the `normal` (non-crit) outcome
  from every engine, uniformly — `matchup.ts` has nothing else to use
  anyway, so this keeps the scoring formula identical across all four
  eras rather than having its precision silently vary by generation. Crit
  chance/damage from the three engines that model it is still surfaced in
  the UI as supplementary info; it never affects the recommendation.
- **Move pool**: recommend only from a roster Pokémon's already-selected
  moveset (up to 4 moves, chosen in Phase 2) — never override what the
  user deliberately configured, and no new dependency on the full
  learnable-move pool.
- **Team assembly**: greedy bottleneck-first coverage. Score every
  (roster Pokémon, its best move) against every opposing Pokémon, then
  assign the hardest-to-counter opponent first (lowest best-available
  score across the whole roster), each time picking the best still-unused
  roster Pokémon for it. This is what makes the team size naturally match
  the opponent's team size instead of forcing exactly 6 picks, and avoids
  wasting multiple roster Pokémon on one opponent while another goes
  uncountered.
- **UI placement**: a "Recommend team" section on the existing encounter
  page (`[game]/[gym]/[encounterId]/page.tsx`), not a new route — the
  natural place to see "here's who I'm facing, here's who I should
  bring."

## New modules

All in `web/src/core/`, plus one new UI piece:

- **`matchupEngines.ts`** — the normalizing adapter. Maps a generation
  number to the right Phase 3 engine and flattens every result into one
  shape:

  ```ts
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
    level: number; // NOT nullable — every underlying engine requires a
      // real level. EncounterPokemon.level is `number | null`; the
      // caller (the action, see below) filters out null-level opponents
      // BEFORE ever constructing one of these, so this type intentionally
      // pushes that check to compile time rather than accepting `null`
      // here and re-deciding what to do with it at runtime.
    dynamaxState?: string | null; // only meaningful for generation 6-9
  }

  export async function evaluateNormalizedMatchup(
    generation: number,
    attacker: MatchupAttackerInput,
    attackerMove: string,
    defender: MatchupDefenderInput
  ): Promise<NormalizedMatchup | null>;
  ```

  Dispatch by `generation`:
  - `1` → `evaluateGen1Matchup` (attacker has no `nature` field on that
    engine's input type — this adapter simply omits it when constructing
    the call, since `MatchupAttackerInput.nature` is unused for Gen 1).
  - `2 | 3` → `evaluateGen23Matchup({ generation, ... })`.
  - `4 | 5` → `evaluateGen45Matchup({ generation, ... })`.
  - anything else (`6`-`9`, or the app's default) → `evaluateMatchup`
    (Gen 6-9), passing `dynamaxState` through; this engine has no
    `criticalHit`/`normal` split, so `NormalizedMatchup` is built directly
    from its flat result.
  - Every branch reads only the `normal` outcome (or the flat result, for
    Gen 6-9) — `criticalHit` is intentionally dropped here per the
    crit-handling decision above; a caller that wants crit info for
    display calls the underlying engine directly instead of going through
    this adapter.
  - Returns `null` if the underlying engine call returns `null` (any
    failed lookup, a status move, an unresolvable historical typing) —
    same graceful-degradation contract as every engine it wraps.

- **`getGameGeneration(gameName: string): number | null`** — a small
  addition to `web/src/core/queries.ts` (not a new file; this table join
  doesn't exist yet, everything else this phase needs from the DB
  already does). `SELECT gen.number FROM games g JOIN generations gen ON
  g.generation_id = gen.id WHERE g.name = ?`.

- **`recommendation.ts`** — the scoring and team-assembly logic, pure
  functions (no I/O):

  ```ts
  export interface MatchupScore {
    score: number; // higher is better; see formula below
    move: string;
    myHitsToKO: { min: number; max: number }; // the ORIGINAL range, not
      // averaged — kept for display ("2-3 hits to KO"), clamped (see
      // HITS_TO_KO_SENTINEL below) so no raw Infinity ever appears here
    theirHitsToKoTaken: { min: number; max: number }; // same clamping,
      // taken from whichever of their moves needs the fewest hits (worst
      // case for me)
    movesFirst: "attacker" | "defender" | "tie";
  }

  export function scoreMatchup(
    myMatchups: { move: string; result: NormalizedMatchup }[], // one per roster move
    theirMatchups: NormalizedMatchup[] // one per their move, attacking me
  ): MatchupScore | null;
  ```

  `scoreMatchup`'s exact order of operations — `theirHitsToKoTaken` is a
  single fixed range for this pairing (it doesn't depend on which of my
  moves I'd pick), computed first; then each of my candidate moves is
  scored against that fixed range's average, and the best-scoring one
  wins. Clamping happens BEFORE anything is stored on the result, not
  just internally for the score formula — `MatchupScore` is nested inside
  `TeamRecommendation`, which is what `getTeamRecommendationAction`
  returns across the Server Action boundary, and `gen1Matchup.ts`'s own
  JSDoc already warns that `Infinity` silently serializes to `null` there
  (`JSON.stringify(Infinity) === "null"`) — a raw, un-clamped `Infinity`
  reaching the client would silently vanish instead of rendering as
  "can't KO this":

  ```ts
  const HITS_TO_KO_SENTINEL = 1000; // stands in for Infinity — both so
    // subtraction never produces NaN, and so this value survives the
    // Server Action boundary as a real (very large) number instead of
    // silently becoming null

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

  export function scoreMatchup(myMatchups, theirMatchups): MatchupScore | null {
    if (myMatchups.length === 0 || theirMatchups.length === 0) return null;

    // Fixed for this pairing: whichever of their moves needs the fewest
    // hits to KO me (compare by average, keep the full clamped range).
    const theirClampedRanges = theirMatchups.map((m) => clampRange(m.hitsToKO));
    const theirHitsToKoTaken = theirClampedRanges.reduce((worst, r) =>
      averageHits(r) < averageHits(worst) ? r : worst
    );
    const theirAvg = averageHits(theirHitsToKoTaken);

    // Best of my candidate moves, scored against that fixed average.
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
  ```

  If `myMatchups` is empty (roster Pokémon has no usable moves — every
  one failed lookup or is a status move against this opponent) or
  `theirMatchups` is empty (same, for the opponent's moveset), returns
  `null` — this pairing has no usable score, excluded from the matrix
  entirely (not scored as 0, which would misrepresent "no data" as "ties
  everything").

  ```ts
  export interface TeamAssignment {
    opponent: { species: string; position: number };
    rosterPokemonId: number;
    species: string;
    move: string;
    summary: MatchupScore;
  }

  // assembleTeam's own output — it only ever sees the "usable" roster
  // (moves.length > 0), so it has no concept of a roster Pokémon excluded
  // for lacking moves; that's tracked separately, one level up.
  export interface AssembledTeam {
    assignments: TeamAssignment[];
    uncoveredOpponents: { species: string; position: number; reason: string }[]; // e.g. "no roster Pokémon scored a usable matchup" or "no level data for this opponent"
  }

  export function assembleTeam(
    scoreMatrix: (MatchupScore | null)[][], // [rosterIndex][opponentIndex]
    roster: RosterPokemon[], // the USABLE roster only — already filtered by the caller
    opponents: EncounterPokemon[]
  ): AssembledTeam;

  // The action's public return type — AssembledTeam plus the roster-level
  // exclusions the action computed before ever calling assembleTeam.
  export interface TeamRecommendation extends AssembledTeam {
    excludedRosterPokemon: { id: number; species: string; reason: string }[];
  }
  ```

  `assembleTeam` implements the bottleneck-first greedy: for each
  opponent, find its best available score across all not-yet-assigned
  roster Pokémon; repeatedly pick the opponent whose best-available score
  is lowest, assign that opponent's best-available roster Pokémon to it,
  remove both from further consideration, and repeat. An opponent with no
  scoreable roster Pokémon at all (every cell in its column is `null`)
  goes to `uncoveredOpponents` immediately rather than blocking the loop.

- **`getTeamRecommendationAction`** — a new Server Action in
  `web/src/app/[game]/[gym]/[encounterId]/actions.ts` (new file,
  following the `"use server"` convention already established in
  `[game]/roster/actions.ts`):

  ```ts
  export async function getTeamRecommendationAction(
    gameName: string,
    encounterId: number
  ): Promise<TeamRecommendation | null>;
  ```

  1. `getGameGeneration(gameName)` — `null` means the game isn't in the
     DB, return `null` (shouldn't happen given the route already
     validates the game/gym/encounter, but defends against it anyway).
  2. `getEncounterTeam(encounterId)` and `listRoster(gameName)` — both
     existing queries, no changes needed.
  3. Partition the roster: any roster Pokémon with `moves.length === 0`
     goes straight into `excludedRosterPokemon` (reason: "no moves
     selected") and is dropped from further consideration — this can be
     a handful of Pokémon out of a larger roster, not just an all-or-
     nothing case. The remaining "usable" roster feeds steps 4-5.
  4. If the usable roster is empty (either the whole roster was empty, or
     every entry got excluded in step 3), return a `TeamRecommendation`
     with an empty `assignments` array, the full `excludedRosterPokemon`
     list from step 3, and every opponent in `uncoveredOpponents` — the
     UI renders this as "add Pokémon with moves to your roster to get a
     recommendation," not an error state.
  5. Partition the opponents too: any with `level: null` can't be scored
     by any battle engine at all (level is a required input to every one
     of them) — set those aside to merge into `uncoveredOpponents`
     directly, before the matrix is even built. The remaining "scoreable"
     opponents feed the matrix.
  6. For each (usable roster Pokémon, scoreable opponent) pair: compute
     `theirMatchups` once (their moveset attacking my roster Pokémon —
     this doesn't depend on which of MY moves I'd use, so it's computed
     once per pair, not once per my-move), then `myMatchups` (one
     `evaluateNormalizedMatchup` call per roster-move). Feed both into
     `scoreMatchup` to build the matrix cell.
  7. `assembleTeam` on the resulting matrix, using only the usable
     roster and scoreable opponents — its `AssembledTeam` result, step
     5's null-level opponents, and step 3's `excludedRosterPokemon` list
     together form the final `TeamRecommendation` (the null-level
     opponents are merged into `assembleTeam`'s own
     `uncoveredOpponents` list, not returned as a separate field).

- **UI**: a small addition to `[game]/[gym]/[encounterId]/page.tsx` — a
  Client Component (`RecommendTeamButton.tsx` or similar) rendering a
  button that calls `getTeamRecommendationAction`, shows a loading state
  while the Server Action runs, then renders the result: one row per
  gym-team Pokémon (in their listed order) showing the recommended
  roster Pokémon + move + a one-line outcome summary ("You go first,
  2-3 hits to KO — they'd need 4-5"), any `uncoveredOpponents` called out
  explicitly, and any `excludedRosterPokemon` likewise.

## Error handling

- Empty roster / no roster Pokémon has moves → explicit empty-state
  message, not an error.
- `getEncounterTeam` returns `null` (shouldn't happen given the route's
  existing `notFound()` guard, but the action re-checks) → `null` from
  the action, UI shows a generic "couldn't load this encounter" message.
- Any individual `evaluateNormalizedMatchup` call returning `null`
  (failed species/move lookup inside the wrapped engine, a status move,
  unresolvable historical typing) → that move is excluded from
  `myMatchups`/`theirMatchups` for that pairing, not treated as a
  zero-damage result. If this empties out `myMatchups` or
  `theirMatchups` entirely for a pairing, that cell is `null` in the
  score matrix (see `scoreMatchup` above).
- An opposing Pokémon with `level: null` (the schema allows it, per
  `EncounterPokemon.level: number | null`) → excluded from scoring
  entirely (added to `uncoveredOpponents` with a reason), since none of
  the four battle engines can compute a matchup without a level.

## Testing

- `matchupEngines.ts`: mocked tests confirming dispatch — generation 1
  calls `evaluateGen1Matchup` (and omits `nature`), 2/3 calls
  `evaluateGen23Matchup` with the right `generation`, 4/5 calls
  `evaluateGen45Matchup` similarly, everything else falls through to
  `evaluateMatchup` with `dynamaxState` passed through. One test per
  branch confirming the underlying engine's `null` propagates.
- `recommendation.ts`: pure-function unit tests with hand-crafted score
  matrices — `scoreMatchup`'s formula (including the Infinity-sentinel
  clamp, verified with a genuine double-immunity case), and `assembleTeam`
  with a deliberately constructed 3×3 matrix where naive left-to-right
  greedy would pick suboptimally (a roster Pokémon that's the *only*
  answer to one opponent, but also a strong answer to another with an
  easy alternative) but bottleneck-first correctly reserves it for the
  opponent with no other option.
- `getGameGeneration`: `queries.ts`'s `getDb()` is hardcoded to the real,
  read-only `gym_leaders.db` at the repo root (no `dbPath` parameter,
  unlike `rosterQueries.ts`) — so, matching `queries.test.ts`'s actual
  established pattern, this is a query test against the real committed
  data, not a temp DB: confirm `getGameGeneration("Red")` returns `1`
  and `getGameGeneration("NotAGame")` returns `null`.
- UI: manual browser verification of the full flow (view an encounter →
  click "Recommend team" → see a sensible team) before calling the phase
  done, matching every prior UI-touching phase's test plan. Both a
  well-stocked roster and an edge case (empty roster, or a roster smaller
  than the gym's team) get manually checked.

## Out of scope (deferred)

- Recommending items, abilities, or EV/IV changes to the roster itself —
  this phase works with the roster exactly as configured.
- Status conditions, weather, or any mechanic already excluded from every
  Phase 3 battle engine — no new data exists for any of this here either.
- Multi-battle planning (e.g. optimizing across several upcoming gym
  encounters at once, or accounting for held items/abilities in scoring
  beyond what the battle engines already factor in).
- Any authenticated/multi-user roster sharing or saved recommendations —
  this phase computes on demand and doesn't persist its output.
