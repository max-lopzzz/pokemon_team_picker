# Phase 1: Web Foundation — Design

## Context

`pokemon_team_picker` is being rebuilt from a Python CLI into a web app. The
end goal (later phases) is: pick a game and gym leader, enter your own
roster (species, level, moveset), and get a recommended team of up to 6
Pokémon with movesets to beat that gym leader, using a real damage
simulation.

That's too large for one spec, so the project is split into phases, each
with its own design → plan → implementation cycle:

1. **Web foundation** (this spec) — rebuild the existing feature (browse
   generation → game → gym → gym leader's team) in a Next.js/TypeScript
   stack, replacing the Python CLI.
2. **Roster input** — UI for entering your own Pokémon (species, level,
   nature, ability, moveset picker from PokeAPI learnsets).
3. **Battle engine** — a pure TypeScript damage-calculator/matchup-evaluator
   (level, stats, STAB, type effectiveness, speed/priority), tested
   independently of the UI.
4. **Recommendation algorithm** — uses the engine to score the user's roster
   against a gym leader's team and pick up to 6 Pokémon with recommended
   movesets. Full combinatorial search over "6 of N roster Pokémon × moveset
   choices" isn't tractable for a large roster, so this will need a
   heuristic (e.g. greedy matchup-coverage) — to be designed in that phase.

Trainer battle data (gym leader teams: species, level, moveset, held item,
per-game/rematch/mode variants) lives in `gym_leaders.db`, a normalized
SQLite database migrated from `gym_leaders.csv` (see
`scripts/migrate_gym_leaders.py`). This is trainer-specific game data that
PokeAPI doesn't have. Species/move reference data (types, stats, abilities,
move details) comes from PokeAPI, since it's more complete and accurate
than the project's existing CSVs.

## Scope of this phase

Rebuild the CLI's existing flow — select generation → game → gym → view
the gym leader's team — as a Next.js web app. No user roster input, no
recommendation logic; those are later phases. This phase's job is to stand
up the app skeleton, the data layer (SQLite + PokeAPI), and prove the whole
stack end-to-end.

## Project layout

New Next.js (App Router, TypeScript) app in `web/`, alongside the existing
Python files and CSV/DB data at the repo root. Nothing old is deleted yet —
the old Python CLI stays until the new app reaches parity with it, at which
point removing it is a separate, explicit decision.

```
web/
  src/
    core/           # framework-free logic, unit tested
      db.ts         # opens gym_leaders.db (../gym_leaders.db) via better-sqlite3, read-only
      queries.ts     # typed query functions (see below)
      pokeapi.ts     # species/move lookups, disk-cached
      types.ts       # shared TS types
    app/            # Next.js routes
      page.tsx              # pick generation -> game
      [game]/page.tsx        # pick gym
      [game]/[gym]/page.tsx  # view team(s)
  .cache/pokeapi/    # gitignored on-disk cache of PokeAPI responses
```

`gym_leaders.db` stays at the repo root (where the migration script writes
it); `core/db.ts` opens it via a relative path (`../gym_leaders.db` from
`web/`). No duplication of the data file.

## Data flow

1. **`/`** — `queries.listGenerations()` returns available generations;
   picking one lists its games (`queries.listGames(generationNumber)`).
2. **`/[game]`** — `queries.listGyms(game)` lists gyms available in that
   game.
3. **`/[game]/[gym]`** — `queries.listEncounters(game, gym)` returns every
   distinct encounter row for that gym+game (leader + variant, e.g. "Cilan —
   starter: Oshawott", "Elesa — challenge mode", or a single unlabeled
   encounter if there's no variation). The user picks one (or it's shown
   directly if there's only one); `queries.getEncounterTeam(encounterId)`
   returns the full team: species, level, gender, held item, dynamax flag,
   and moves, per Pokémon.

**UX simplification vs. the original CLI:** some gyms have multiple leaders
or variants that depend on player choices the original CLI tracked via
sequential questions (starter chosen, rematch count, game mode, etc). This
phase does not replicate that state-tracking — it lists every distinct
encounter as its own selectable entry and lets the user pick directly.
Simpler to build, and arguably better UX for a reference/browsing tool.

**PokeAPI enrichment:** for each species in a displayed team,
`core/pokeapi.ts` fetches type(s), ability list, and sprite, caching the
response to `web/.cache/pokeapi/` keyed by species name so repeated runs
don't re-hit the network. This enrichment is additive — the DB-sourced
fields (level, moves, held item, gender, dynamax) always render regardless
of whether the PokeAPI call succeeds.

## Error handling

- Unknown `game` or `gym` route param (no matching rows in the DB) →
  Next.js `notFound()` → 404 page.
- `gym_leaders.db` missing or unreadable at startup → fail fast with a
  clear error; it's a required local dependency, not something to recover
  from at request time.
- PokeAPI request fails or a species isn't found → log and omit the
  enriched fields for that Pokémon; the page still renders with
  DB-sourced data. Never fail the whole page render because of a single
  species lookup.

## Testing

- Vitest unit tests for everything in `core/`: query functions against a
  test copy of the DB (or an in-memory SQLite seeded with known rows), and
  the PokeAPI client's caching behavior (mocked fetch). Built test-first.
- Pages/routes are checked manually in the browser during development;
  the scope here (read-only browsing) doesn't warrant E2E test
  infrastructure yet.

## Out of scope (deferred to later phases)

- User roster input, moveset selection UI.
- Damage calculation / battle simulation.
- Team recommendation algorithm.
- Removing the old Python CLI files.
- Importing `pokedex.csv` / `moves.csv` / `typechart.csv` / `natures.csv`
  into SQLite (PokeAPI is the source for this data going forward).
