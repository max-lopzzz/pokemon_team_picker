# Phase 1: Web Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the existing gym-leader browsing flow (generation → game → gym → team) as a Next.js/TypeScript web app, replacing the Python CLI, backed by the existing `gym_leaders.db` SQLite database and PokeAPI.

**Architecture:** A single Next.js (App Router) TypeScript app in `web/`. All data access — SQLite queries and PokeAPI lookups — lives in a framework-free `web/src/core/` module with its own unit tests; the `web/src/app/` routes are thin Server Components that call into `core/` and render. No client-side state or API routes needed — everything renders server-side.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, `better-sqlite3` (reads `gym_leaders.db`), native `fetch` for PokeAPI, Vitest for unit tests.

**Spec:** [docs/superpowers/specs/2026-08-23-phase1-web-foundation-design.md](../specs/2026-08-23-phase1-web-foundation-design.md)

## Global Constraints

- New app lives entirely under `web/`; nothing at the repo root (Python files, CSVs, `gym_leaders.db`, `scripts/`) is modified or deleted.
- `gym_leaders.db` is read read-only from `web/` via the relative path `../gym_leaders.db` — never copied or duplicated.
- `core/` code has zero Next.js/React imports — it must be importable and testable in plain Node.
- No placeholder/mock data: `core/queries.ts` is tested against the real, already-committed `gym_leaders.db`.
- PokeAPI failures degrade gracefully (omit enriched fields) — they never crash a page render.
- Pages are verified manually in the browser, not with automated UI tests (matches spec scope).

---

### Task 1: Scaffold the Next.js app

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/next.config.ts`
- Create: `web/vitest.config.ts`
- Create: `.gitignore` (repo root — none exists yet)
- Create: `web/src/app/layout.tsx`
- Create: `web/src/app/page.tsx`

**Interfaces:**
- Produces: a working `npm run dev` / `npm run build` / `npm test` toolchain in `web/` that later tasks add files into. No exported functions yet.

- [ ] **Step 1: Create `web/package.json`**

```json
{
  "name": "pokemon-team-picker-web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "better-sqlite3": "^11.3.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/better-sqlite3": "^7.6.11",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `web/next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

- [ ] **Step 4: Create `web/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 5: Create root `.gitignore`**

```
web/node_modules/
web/.next/
web/.cache/
web/next-env.d.ts
```

- [ ] **Step 6: Create `web/src/app/layout.tsx`**

```tsx
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Create `web/src/app/page.tsx`**

```tsx
export default function HomePage() {
  return <main>Pokémon Team Picker</main>;
}
```

- [ ] **Step 8: Install dependencies**

Run: `cd web && npm install`
Expected: installs without errors, creates `web/node_modules` and `web/package-lock.json`.

- [ ] **Step 9: Verify the dev server serves the placeholder page**

Run (from `web/`): `npm run dev &` then `sleep 3 && curl -s http://localhost:3000 | grep "Pokémon Team Picker"` then kill the dev server (`kill %1`).
Expected: the curl output contains "Pokémon Team Picker".

- [ ] **Step 10: Commit**

```bash
git add web/package.json web/package-lock.json web/tsconfig.json web/next.config.ts web/vitest.config.ts .gitignore web/src/app/layout.tsx web/src/app/page.tsx
git commit -m "Scaffold Next.js app for web foundation"
```

---

### Task 2: Core data layer — `db.ts` + `queries.ts`

**Files:**
- Test: `web/src/core/queries.test.ts`
- Create: `web/src/core/types.ts`
- Create: `web/src/core/db.ts`
- Create: `web/src/core/queries.ts`

**Interfaces:**
- Produces:
  - `getDb(): Database.Database` (from `db.ts`)
  - `listGenerations(): Generation[]`
  - `listGames(generationNumber: number): Game[]`
  - `listGyms(gameName: string): Gym[]`
  - `listEncounters(gameName: string, gymName: string): Encounter[]`
  - `getEncounterTeam(encounterId: number): EncounterTeam | null`
  - Types `Generation`, `Game`, `Gym`, `Encounter`, `EncounterPokemon`, `EncounterTeam` (from `types.ts`)
- Consumes: the committed `gym_leaders.db` at the repo root (`../gym_leaders.db` relative to `web/`).

- [ ] **Step 1: Write the failing test file** — `web/src/core/queries.test.ts`

These assertions use real, already-verified data from the committed `gym_leaders.db` (Brock's Red team and Blue's three starter-dependent encounters at the Pokémon League) — no fixtures needed.

```ts
import { describe, it, expect } from "vitest";
import {
  listGenerations,
  listGames,
  listGyms,
  listEncounters,
  getEncounterTeam,
} from "./queries";

describe("listGenerations", () => {
  it("returns all 9 generations ordered by number", () => {
    const generations = listGenerations();
    expect(generations).toHaveLength(9);
    expect(generations[0].number).toBe(1);
    expect(generations[8].number).toBe(9);
  });
});

describe("listGames", () => {
  it("returns the generation 1 games", () => {
    const games = listGames(1);
    expect(games.map((g) => g.name).sort()).toEqual([
      "Blue",
      "Green",
      "Red",
      "Yellow",
    ]);
  });
});

describe("listGyms", () => {
  it("returns the gyms in Red, including Pewter Gym", () => {
    const gyms = listGyms("Red");
    expect(gyms.map((g) => g.name)).toContain("Pewter Gym");
    expect(gyms.map((g) => g.name)).toContain("Pokemon League");
  });
});

describe("listEncounters", () => {
  it("returns a single, variant-less encounter for Pewter Gym", () => {
    const encounters = listEncounters("Red", "Pewter Gym");
    expect(encounters).toHaveLength(1);
    expect(encounters[0].leaderName).toBe("Brock");
    expect(encounters[0].variant).toBeNull();
  });

  it("returns one encounter per starter for Blue at the Pokemon League", () => {
    const encounters = listEncounters("Red", "Pokemon League");
    const blue = encounters.filter((e) => e.leaderName === "Blue");
    expect(blue.map((e) => e.variant).sort()).toEqual([
      "starter: Bulbasaur",
      "starter: Charmander",
      "starter: Squirtle",
    ]);
  });
});

describe("getEncounterTeam", () => {
  it("returns Brock's Red team with species, level, and moves", () => {
    const [encounter] = listEncounters("Red", "Pewter Gym");
    const team = getEncounterTeam(encounter.id);

    expect(team).not.toBeNull();
    expect(team!.pokemon.map((p) => p.species)).toEqual(["Geodude", "Onix"]);

    expect(team!.pokemon[0].level).toBe(12);
    expect(team!.pokemon[0].moves).toEqual(["Tackle", "Defense Curl"]);

    expect(team!.pokemon[1].level).toBe(14);
    expect(team!.pokemon[1].moves).toEqual(["Tackle", "Screech", "Bide"]);
  });

  it("returns null for an unknown encounter id", () => {
    expect(getEncounterTeam(999999)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run (from `web/`): `npm test`
Expected: FAIL — `Cannot find module './queries'` (the module doesn't exist yet).

- [ ] **Step 3: Create `web/src/core/types.ts`**

```ts
export interface Generation {
  id: number;
  number: number;
}

export interface Game {
  id: number;
  name: string;
  generationId: number;
}

export interface Gym {
  id: number;
  name: string;
  gameId: number;
}

export interface Encounter {
  id: number;
  gameId: number;
  gymId: number;
  leaderId: number;
  leaderName: string;
  variant: string | null;
}

export interface EncounterPokemon {
  id: number;
  position: number;
  species: string;
  level: number | null;
  gender: string | null;
  heldItem: string | null;
  dynamax: string | null;
  moves: string[];
}

export interface EncounterTeam {
  encounter: Encounter;
  pokemon: EncounterPokemon[];
}

export interface SpeciesInfo {
  name: string;
  types: string[];
  abilities: string[];
  spriteUrl: string | null;
}
```

- [ ] **Step 4: Create `web/src/core/db.ts`**

```ts
import Database from "better-sqlite3";
import path from "node:path";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = path.join(process.cwd(), "..", "gym_leaders.db");
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
  }
  return db;
}
```

- [ ] **Step 5: Create `web/src/core/queries.ts`**

```ts
import { getDb } from "./db";
import type {
  Generation,
  Game,
  Gym,
  Encounter,
  EncounterPokemon,
  EncounterTeam,
} from "./types";

export function listGenerations(): Generation[] {
  return getDb()
    .prepare("SELECT id, number FROM generations ORDER BY number")
    .all() as Generation[];
}

export function listGames(generationNumber: number): Game[] {
  return getDb()
    .prepare(
      `SELECT g.id, g.name, g.generation_id AS generationId
       FROM games g
       JOIN generations gen ON g.generation_id = gen.id
       WHERE gen.number = ?
       ORDER BY g.name`
    )
    .all(generationNumber) as Game[];
}

export function listGyms(gameName: string): Gym[] {
  return getDb()
    .prepare(
      `SELECT gy.id, gy.name, gy.game_id AS gameId
       FROM gyms gy
       JOIN games g ON gy.game_id = g.id
       WHERE g.name = ?
       ORDER BY gy.id`
    )
    .all(gameName) as Gym[];
}

export function listEncounters(gameName: string, gymName: string): Encounter[] {
  return getDb()
    .prepare(
      `SELECT e.id, e.game_id AS gameId, e.gym_id AS gymId, e.leader_id AS leaderId,
              l.name AS leaderName, e.variant AS variant
       FROM encounters e
       JOIN games g ON e.game_id = g.id
       JOIN gyms gy ON e.gym_id = gy.id
       JOIN gym_leaders l ON e.leader_id = l.id
       WHERE g.name = ? AND gy.name = ?
       ORDER BY e.id`
    )
    .all(gameName, gymName) as Encounter[];
}

export function getEncounterTeam(encounterId: number): EncounterTeam | null {
  const db = getDb();

  const encounter = db
    .prepare(
      `SELECT e.id, e.game_id AS gameId, e.gym_id AS gymId, e.leader_id AS leaderId,
              l.name AS leaderName, e.variant AS variant
       FROM encounters e
       JOIN gym_leaders l ON e.leader_id = l.id
       WHERE e.id = ?`
    )
    .get(encounterId) as Encounter | undefined;

  if (!encounter) return null;

  const pokemonRows = db
    .prepare(
      `SELECT id, position, species, level, gender, held_item AS heldItem, dynamax
       FROM encounter_pokemon
       WHERE encounter_id = ?
       ORDER BY position`
    )
    .all(encounterId) as Omit<EncounterPokemon, "moves">[];

  const moveStmt = db.prepare(
    `SELECT move_name FROM encounter_pokemon_moves
     WHERE encounter_pokemon_id = ? ORDER BY slot`
  );

  const pokemon: EncounterPokemon[] = pokemonRows.map((p) => ({
    ...p,
    moves: (moveStmt.all(p.id) as { move_name: string }[]).map(
      (m) => m.move_name
    ),
  }));

  return { encounter, pokemon };
}
```

- [ ] **Step 6: Run the test and verify it passes**

Run (from `web/`): `npm test`
Expected: PASS — all 7 tests green.

- [ ] **Step 7: Commit**

```bash
git add web/src/core/types.ts web/src/core/db.ts web/src/core/queries.ts web/src/core/queries.test.ts
git commit -m "Add core SQLite data layer (types, db, queries)"
```

---

### Task 3: PokeAPI client with disk caching

**Files:**
- Test: `web/src/core/pokeapi.test.ts`
- Create: `web/src/core/pokeapi.ts`

**Interfaces:**
- Consumes: `SpeciesInfo` type from `./types` (Task 2).
- Produces: `getSpeciesInfo(species: string, options?: { cacheDir?: string; fetchImpl?: typeof fetch }): Promise<SpeciesInfo | null>`

- [ ] **Step 1: Write the failing test file** — `web/src/core/pokeapi.test.ts`

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getSpeciesInfo } from "./pokeapi";

describe("getSpeciesInfo", () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "pokeapi-cache-"));
  });

  afterEach(async () => {
    await fs.rm(cacheDir, { recursive: true, force: true });
  });

  it("fetches and caches species info on first call", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        types: [{ type: { name: "rock" } }, { type: { name: "ground" } }],
        abilities: [{ ability: { name: "sturdy" } }],
        sprites: { front_default: "https://example.com/geodude.png" },
      }),
    });

    const info = await getSpeciesInfo("Geodude", { cacheDir, fetchImpl });

    expect(info).toEqual({
      name: "Geodude",
      types: ["rock", "ground"],
      abilities: ["sturdy"],
      spriteUrl: "https://example.com/geodude.png",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const cacheFile = await fs.readFile(
      path.join(cacheDir, "geodude.json"),
      "utf-8"
    );
    expect(JSON.parse(cacheFile)).toEqual(info);
  });

  it("reads from cache on the second call instead of fetching again", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        types: [{ type: { name: "electric" } }],
        abilities: [{ ability: { name: "static" } }],
        sprites: { front_default: null },
      }),
    });

    await getSpeciesInfo("Pikachu", { cacheDir, fetchImpl });
    await getSpeciesInfo("Pikachu", { cacheDir, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns null and writes no cache file when the API call fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false });

    const info = await getSpeciesInfo("Missingno", { cacheDir, fetchImpl });

    expect(info).toBeNull();
    await expect(
      fs.readFile(path.join(cacheDir, "missingno.json"), "utf-8")
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run (from `web/`): `npm test`
Expected: FAIL — `Cannot find module './pokeapi'`.

- [ ] **Step 3: Create `web/src/core/pokeapi.ts`**

```ts
import fs from "node:fs/promises";
import path from "node:path";
import type { SpeciesInfo } from "./types";

const DEFAULT_CACHE_DIR = path.join(process.cwd(), ".cache", "pokeapi");
const POKEAPI_BASE = "https://pokeapi.co/api/v2";

interface Options {
  cacheDir?: string;
  fetchImpl?: typeof fetch;
}

export async function getSpeciesInfo(
  species: string,
  options: Options = {}
): Promise<SpeciesInfo | null> {
  const cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;
  const fetchImpl = options.fetchImpl ?? fetch;

  const cached = await readCache(species, cacheDir);
  if (cached) return cached;

  const fetched = await fetchSpeciesInfo(species, fetchImpl);
  if (fetched) await writeCache(species, cacheDir, fetched);
  return fetched;
}

function cacheFilePath(species: string, cacheDir: string): string {
  return path.join(cacheDir, `${species.toLowerCase()}.json`);
}

async function readCache(
  species: string,
  cacheDir: string
): Promise<SpeciesInfo | null> {
  try {
    const raw = await fs.readFile(cacheFilePath(species, cacheDir), "utf-8");
    return JSON.parse(raw) as SpeciesInfo;
  } catch {
    return null;
  }
}

async function writeCache(
  species: string,
  cacheDir: string,
  info: SpeciesInfo
): Promise<void> {
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(cacheFilePath(species, cacheDir), JSON.stringify(info), "utf-8");
}

async function fetchSpeciesInfo(
  species: string,
  fetchImpl: typeof fetch
): Promise<SpeciesInfo | null> {
  try {
    const res = await fetchImpl(
      `${POKEAPI_BASE}/pokemon/${species.toLowerCase()}`
    );
    if (!res.ok) return null;

    const data = await res.json();
    return {
      name: species,
      types: data.types.map((t: { type: { name: string } }) => t.type.name),
      abilities: data.abilities.map(
        (a: { ability: { name: string } }) => a.ability.name
      ),
      spriteUrl: data.sprites?.front_default ?? null,
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run (from `web/`): `npm test`
Expected: PASS — all 3 new tests green, plus the 7 from Task 2 (10 total).

- [ ] **Step 5: Commit**

```bash
git add web/src/core/pokeapi.ts web/src/core/pokeapi.test.ts
git commit -m "Add PokeAPI client with disk-cached species lookups"
```

---

### Task 4: Home page — pick generation and game

**Files:**
- Modify: `web/src/app/page.tsx`

**Interfaces:**
- Consumes: `listGenerations()`, `listGames(generationNumber: number)` from `@/core/queries` (Task 2).

- [ ] **Step 1: Replace `web/src/app/page.tsx`**

```tsx
import Link from "next/link";
import { listGenerations, listGames } from "@/core/queries";

export default function HomePage() {
  const generations = listGenerations();

  return (
    <main>
      <h1>Pokémon Team Picker</h1>
      {generations.map((gen) => {
        const games = listGames(gen.number);
        return (
          <section key={gen.id}>
            <h2>Generation {gen.number}</h2>
            <ul>
              {games.map((game) => (
                <li key={game.id}>
                  <Link href={`/${encodeURIComponent(game.name)}`}>
                    {game.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
```

- [ ] **Step 2: Verify in the browser**

Run (from `web/`): `npm run dev &`, wait a few seconds, then open `http://localhost:3000` in the browser tool. Confirm the page lists "Generation 1" through "Generation 9", and that Generation 1 includes a "Red" link. Kill the dev server afterward.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/page.tsx
git commit -m "Add home page: pick generation and game"
```

---

### Task 5: Game page — pick a gym

**Files:**
- Create: `web/src/app/[game]/page.tsx`

**Interfaces:**
- Consumes: `listGyms(gameName: string)` from `@/core/queries` (Task 2).

- [ ] **Step 1: Create `web/src/app/[game]/page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { listGyms } from "@/core/queries";

export default async function GamePage({
  params,
}: {
  params: Promise<{ game: string }>;
}) {
  const { game } = await params;
  const gameName = decodeURIComponent(game);
  const gyms = listGyms(gameName);

  if (gyms.length === 0) {
    notFound();
  }

  return (
    <main>
      <h1>{gameName}</h1>
      <ul>
        {gyms.map((gym) => (
          <li key={gym.id}>
            <Link
              href={`/${encodeURIComponent(gameName)}/${encodeURIComponent(gym.name)}`}
            >
              {gym.name}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: Verify in the browser**

Start the dev server, navigate to `http://localhost:3000/Red`. Confirm it lists gyms including "Pewter Gym" and "Pokemon League". Then navigate to `http://localhost:3000/NotAGame` and confirm it renders Next's 404 page. Kill the dev server afterward.

- [ ] **Step 3: Commit**

```bash
git add "web/src/app/[game]/page.tsx"
git commit -m "Add game page: pick a gym"
```

---

### Task 6: Gym page — pick (or auto-select) an encounter

**Files:**
- Create: `web/src/app/[game]/[gym]/page.tsx`

**Interfaces:**
- Consumes: `listEncounters(gameName: string, gymName: string)` from `@/core/queries` (Task 2).

- [ ] **Step 1: Create `web/src/app/[game]/[gym]/page.tsx`**

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { listEncounters } from "@/core/queries";

export default async function GymPage({
  params,
}: {
  params: Promise<{ game: string; gym: string }>;
}) {
  const { game, gym } = await params;
  const gameName = decodeURIComponent(game);
  const gymName = decodeURIComponent(gym);
  const encounters = listEncounters(gameName, gymName);

  if (encounters.length === 0) {
    notFound();
  }

  if (encounters.length === 1) {
    redirect(
      `/${encodeURIComponent(gameName)}/${encodeURIComponent(gymName)}/${encounters[0].id}`
    );
  }

  return (
    <main>
      <h1>{gymName}</h1>
      <ul>
        {encounters.map((encounter) => (
          <li key={encounter.id}>
            <Link
              href={`/${encodeURIComponent(gameName)}/${encodeURIComponent(gymName)}/${encounter.id}`}
            >
              {encounter.leaderName}
              {encounter.variant ? ` — ${encounter.variant}` : ""}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: Verify in the browser**

Start the dev server. Navigate to `http://localhost:3000/Red/Pewter%20Gym` and confirm it redirects straight to `/Red/Pewter%20Gym/1` (Brock's team, single encounter — no picker shown). Then navigate to `http://localhost:3000/Red/Pokemon%20League` and confirm it shows a list of encounters including three "Blue" entries with different `starter:` variants. Kill the dev server afterward.

- [ ] **Step 3: Commit**

```bash
git add "web/src/app/[game]/[gym]/page.tsx"
git commit -m "Add gym page: pick or auto-select an encounter"
```

---

### Task 7: Encounter page — team view with PokeAPI enrichment

**Files:**
- Create: `web/src/app/[game]/[gym]/[encounterId]/page.tsx`

**Interfaces:**
- Consumes: `getEncounterTeam(encounterId: number)` from `@/core/queries` (Task 2), `getSpeciesInfo(species: string)` from `@/core/pokeapi` (Task 3).

- [ ] **Step 1: Create `web/src/app/[game]/[gym]/[encounterId]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { getEncounterTeam } from "@/core/queries";
import { getSpeciesInfo } from "@/core/pokeapi";

export default async function EncounterPage({
  params,
}: {
  params: Promise<{ game: string; gym: string; encounterId: string }>;
}) {
  const { encounterId } = await params;
  const team = getEncounterTeam(Number(encounterId));

  if (!team) {
    notFound();
  }

  const enriched = await Promise.all(
    team.pokemon.map(async (p) => ({
      ...p,
      info: await getSpeciesInfo(p.species),
    }))
  );

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
    </main>
  );
}
```

- [ ] **Step 2: Verify in the browser**

Start the dev server, navigate to `http://localhost:3000/Red/Pewter%20Gym/1`. Confirm the page shows "Brock", and two Pokémon entries: Geodude (Level 12, Moves: Tackle, Defense Curl, Type: rock, ...) and Onix (Level 14, Moves: Tackle, Screech, Bide). Confirm type/ability lines are present (proving the live PokeAPI call succeeded) and no errors are thrown. Navigate to `http://localhost:3000/Red/Pewter%20Gym/999999` and confirm it renders Next's 404 page. Kill the dev server afterward.

- [ ] **Step 3: Commit**

```bash
git add "web/src/app/[game]/[gym]/[encounterId]/page.tsx"
git commit -m "Add encounter page: team view with PokeAPI enrichment"
```

---

## Self-Review Notes

- **Spec coverage:** project layout (Task 1), `core/db.ts`+`queries.ts` (Task 2), `core/pokeapi.ts` with disk cache (Task 3), all three routes plus the encounter-picker UX simplification (Tasks 4-6), team view with graceful PokeAPI degradation (Task 7). Error handling (`notFound()` for bad routes, fail-fast DB open) is covered in Tasks 2, 5, 6, 7. Testing approach (Vitest for `core/`, manual browser checks for pages) matches every task.
- **Placeholder scan:** none — every step has full file contents or an exact command with an exact expected result.
- **Type consistency:** `Generation`, `Game`, `Gym`, `Encounter`, `EncounterPokemon`, `EncounterTeam`, `SpeciesInfo` are defined once in Task 2's `types.ts` and reused verbatim (same field names/casing) by every later task; `getSpeciesInfo`'s signature from Task 3 matches its call site in Task 7.
