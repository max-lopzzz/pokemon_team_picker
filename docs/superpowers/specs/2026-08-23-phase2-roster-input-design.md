# Phase 2: Roster Input — Design

## Context

This is the second phase of the `pokemon_team_picker` rewrite (see
[Phase 1's spec](2026-08-23-phase1-web-foundation-design.md) for the overall
phase breakdown). Phase 1 shipped the Next.js app skeleton, a read-only
SQLite data layer over `gym_leaders.db`, and a PokeAPI client with disk
caching (`web/src/core/pokeapi.ts`), plus the generation → game → gym →
gym-leader-team browsing flow.

Phase 2 adds the ability to enter your own Pokémon roster: species, level,
nature, ability, full IVs/EVs, and a moveset picked from the complete
learnable pool (level-up, TM/HM, tutor, and egg moves) for the selected
game. This is the data Phase 4's recommendation engine will need to score
against a gym leader's team.

## Scope of this phase

A per-game roster page where you can add and remove Pokémon, with full
stat detail (IVs/EVs) and a moveset picker sourced from PokeAPI's learnset
data for the specific game you're playing. No damage calculation, no
recommendation logic — those are Phases 3 and 4. No editing an existing
roster entry (delete and re-add covers it for now).

## Storage: a new, separate, writable `roster.db`

`gym_leaders.db` is deliberately read-only, static reference data built
from a CSV by a migration script. The roster is different: it's mutable
data the app itself creates as you use it, so it needs its own database —
`roster.db`, at the repo root next to `gym_leaders.db`, opened read-write
from `web/` the same way (`../roster.db`). Unlike `gym_leaders.db`,
`roster.db` is **not** committed to git (added to `.gitignore`) and is not
pre-seeded — its schema is created lazily on first access
(`CREATE TABLE IF NOT EXISTS`), not via an offline migration step.

**Schema:**

```sql
CREATE TABLE roster_pokemon (
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

CREATE TABLE roster_pokemon_moves (
  id INTEGER PRIMARY KEY,
  roster_pokemon_id INTEGER NOT NULL REFERENCES roster_pokemon(id),
  slot INTEGER NOT NULL,
  move_name TEXT NOT NULL
);
```

`roster_pokemon_moves` holds the Pokémon's currently-known moveset (up to
4 moves) — this is what you'd actually enter as "what my Pokémon knows
right now." It is separate from the full learnable pool, which is never
stored: it's fetched live from PokeAPI per species+game (see below), the
same disk-caching pattern Phase 1 established.

`game` is scoped per the same game names `gym_leaders.db` uses (`Red`,
`Scarlet`, etc.) — each game gets its own independent roster, since
movesets and species availability differ by game.

## Server Actions, not a REST API

Roster CRUD uses Next.js Server Actions (`"use server"` functions called
directly from form submissions), not a separate `/api/roster` route layer.
This is a local, single-user tool — a REST API adds indirection with no
benefit here, and it keeps the "everything renders server-side" shape
Phase 1 established. `web/src/app/[game]/roster/actions.ts` exports
`addRosterPokemon(formData)` and `deleteRosterPokemon(id)`; both call into
`web/src/core/rosterDb.ts` (schema init + connection, mirroring `db.ts`
but read-write) and `web/src/core/rosterQueries.ts` (CRUD functions, mirroring
`queries.ts`'s shape) and revalidate the roster page afterward.

Validation is a separate, framework-free module —
`web/src/core/rosterValidation.ts` — so it's unit-testable without
exercising Next.js's server-action machinery. The Server Action calls
validation first; on failure it returns a structured error the page
displays without touching the database.

## Learnable moves: a new PokeAPI-backed module + a version-group mapping

PokeAPI's learnset data is keyed by "version group" (e.g. `red-blue`,
`scarlet-violet`), which doesn't match `gym_leaders.db`'s game names
(`Red`, `Scarlet`). `web/src/core/versionGroups.ts` exports a static
`GAME_TO_VERSION_GROUP: Record<string, string>` covering all 35 games in
`gym_leaders.db`, verified against PokeAPI's actual `/version-group` list:

| Game(s) | Version group |
|---|---|
| Red, Blue, Green | `red-blue` |
| Yellow | `yellow` |
| Gold, Silver | `gold-silver` |
| Crystal | `crystal` |
| Ruby, Sapphire | `ruby-sapphire` |
| Emerald | `emerald` |
| FireRed, LeafGreen | `firered-leafgreen` |
| Diamond, Pearl | `diamond-pearl` |
| Platinum | `platinum` |
| HeartGold, SoulSilver | `heartgold-soulsilver` |
| Black, White | `black-white` |
| Black 2, White 2 | `black-2-white-2` |
| X, Y | `x-y` |
| Omega Ruby, Alpha Sapphire | `omega-ruby-alpha-sapphire` |
| Sun, Moon | `sun-moon` |
| Ultra Sun, Ultra Moon | `ultra-sun-ultra-moon` |
| Sword, Shield | `sword-shield` |
| Brilliant Diamond, Shining Pearl | `brilliant-diamond-shining-pearl` |
| Scarlet, Violet | `scarlet-violet` |

**Known simplification:** PokeAPI's `red-blue` version group only actually
contains `red` and `blue`; Japan-exclusive `Green` has its own separate,
sparser version group (`red-green-japan`) that isn't practically useful
here. Since Gen 1 movesets are nearly identical across Red/Green/Blue
(Yellow is the one with real differences, and it already has its own
group), `Green` is mapped to `red-blue` as a deliberate, documented
approximation rather than a bug.

`web/src/core/movelearn.ts` exports
`getLearnableMoves(species: string, game: string): Promise<LearnableMoves | null>`,
where `LearnableMoves` groups moves by method:

```ts
interface LearnableMoves {
  levelUp: string[];
  machine: string[];
  tutor: string[];
  egg: string[];
}
```

It maps `game` to a version-group slug, fetches `/pokemon/{species}` from
PokeAPI, filters `moves[].version_group_details` to entries matching that
slug, and groups by `move_learn_method.name`. This duplicates one network
call `getSpeciesInfo` already makes (both fetch `/pokemon/{species}`) —
a deliberate trade-off for module isolation over one fewer request; not
worth coupling this phase's code to Phase 1's already-shipped,
already-tested `pokeapi.ts` internals. Results are disk-cached the same
way as `getSpeciesInfo`, keyed by `species` + version-group slug, in a
distinct cache subdirectory so the two caches never collide.

## UI flow

`/[game]/roster` (a new route) lists the game's roster (species, level,
moveset) with a delete action per entry, and an "Add Pokémon" form:

- **Species** — free text, validated server-side against PokeAPI
  (`getSpeciesInfo` returning non-null) when the form is submitted.
- **Level** — 1-100.
- **Nature** — a dropdown of the 25 canonical natures (a small, permanently
  static list — hardcoded in `web/src/core/natures.ts`, sourced from the
  same data already in the repo's `natures.csv`, not re-fetched from
  PokeAPI since it never changes).
- **Ability** — a dropdown populated from the submitted species' actual
  abilities. The rest of the form (species, level, nature, IVs/EVs,
  moveset) stays a single Server Component form — no page reload, no
  multi-step wizard. Only the species→abilities (and species→moveset)
  lookups are interactive, so they're the one `"use client"` island on
  the page: a small client component that calls a Server Action
  (`getSpeciesOptions(species, game)`, returning abilities +
  `LearnableMoves` together in one call) on the species field's `blur`
  event, and populates the ability dropdown and moveset checkboxes from
  the result. `addRosterPokemon` still re-validates everything
  server-side on submit — the client-side lookup is for populating
  choices, not the source of truth.
- **IVs / EVs** — 6 numeric fields each. IVs 0-31. EVs 0-252 per stat,
  total ≤ 510 (standard game rules).
- **Moveset** — once species and game are known, `getLearnableMoves` is
  called to render the full pool grouped by method (level-up / TM-HM /
  tutor / egg) as checkboxes; up to 4 may be selected as "currently
  known."

## Error handling

- Species doesn't resolve via PokeAPI → validation error, form re-renders
  with the message, nothing written.
- Ability not among the species' real abilities, level/IV/EV out of range,
  EV total over 510, or a selected move not in the species' learnable pool
  for the game → validation error, same as above. All of this lives in
  `rosterValidation.ts`, checked before any database write.
- `roster.db` missing → unlike `gym_leaders.db`, this is expected on first
  run: the schema is created on first write, not required to pre-exist.
- Deleting an id that doesn't exist → no-op, not an error (idempotent).
- PokeAPI failures when fetching the learnable-move pool → same graceful
  degradation as Phase 1's `getSpeciesInfo`: return `null`, and the page
  shows "moveset unavailable" rather than crashing — species/level/IV/EV
  entry still works even if PokeAPI is unreachable.

## Testing

- Vitest unit tests, real-data where practical (matching Phase 1's
  pattern):
  - `rosterValidation.ts` — pure functions, no I/O, straightforward unit
    tests for every validation rule (range checks, EV total, move
    membership, ability membership).
  - `rosterDb.ts` / `rosterQueries.ts` — tested against a temporary SQLite
    file created per test run (not the real `roster.db`), verifying CRUD
    round-trips.
  - `movelearn.ts` — mocked `fetch`, same dependency-injection pattern as
    Phase 1's `pokeapi.test.ts`.
  - `versionGroups.ts` — assert all 35 games from `gym_leaders.db` have an
    entry (cross-checked against the real, committed database, no mocks
    needed).
- The roster page and Server Actions are verified manually in the browser,
  consistent with Phase 1's approach to pages.

## Out of scope (deferred)

- Editing an existing roster entry (delete + re-add instead).
- Held items on roster Pokémon.
- Copying/reusing a roster across games.
- Damage calculation and team recommendation (Phases 3 and 4).
