import fs from "node:fs/promises";
import path from "node:path";
import { GAME_TO_VERSION_GROUP } from "./versionGroups";
import type { LearnableMoves } from "./types";

const DEFAULT_CACHE_DIR = path.join(process.cwd(), ".cache", "pokeapi-moves");
const POKEAPI_BASE = "https://pokeapi.co/api/v2";

interface Options {
  cacheDir?: string;
  fetchImpl?: typeof fetch;
}

interface CacheMiss {
  __miss: true;
}

type CacheEntry = LearnableMoves | CacheMiss;

interface RawMoveEntry {
  move: { name: string };
  version_group_details: {
    version_group: { name: string };
    move_learn_method: { name: string };
  }[];
}

function isCacheMiss(entry: CacheEntry): entry is CacheMiss {
  return (entry as CacheMiss).__miss === true;
}

export async function getLearnableMoves(
  species: string,
  game: string,
  options: Options = {}
): Promise<LearnableMoves | null> {
  const versionGroup = GAME_TO_VERSION_GROUP[game];
  if (!versionGroup) return null;

  const cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;
  const fetchImpl = options.fetchImpl ?? fetch;
  const cacheKey = `${species.toLowerCase()}-${versionGroup}`;

  const cached = await readCache(cacheKey, cacheDir);
  if (cached) {
    return isCacheMiss(cached) ? null : cached;
  }

  const fetched = await fetchLearnableMoves(species, versionGroup, fetchImpl);
  try {
    await writeCache(cacheKey, cacheDir, fetched ?? { __miss: true });
  } catch (err) {
    console.error(`Failed to cache learnable moves for "${species}":`, err);
  }
  return fetched;
}

function cacheFilePath(cacheKey: string, cacheDir: string): string {
  return path.join(cacheDir, `${cacheKey}.json`);
}

async function readCache(
  cacheKey: string,
  cacheDir: string
): Promise<CacheEntry | null> {
  try {
    const raw = await fs.readFile(cacheFilePath(cacheKey, cacheDir), "utf-8");
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

async function writeCache(
  cacheKey: string,
  cacheDir: string,
  entry: CacheEntry
): Promise<void> {
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(cacheFilePath(cacheKey, cacheDir), JSON.stringify(entry), "utf-8");
}

async function fetchLearnableMoves(
  species: string,
  versionGroup: string,
  fetchImpl: typeof fetch
): Promise<LearnableMoves | null> {
  try {
    const res = await fetchImpl(
      `${POKEAPI_BASE}/pokemon/${encodeURIComponent(species.toLowerCase())}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) {
      console.error(
        `PokeAPI learnset request failed for species "${species}": HTTP ${res.status}`
      );
      return null;
    }

    const data = await res.json();
    const result: LearnableMoves = { levelUp: [], machine: [], tutor: [], egg: [] };

    for (const entry of data.moves as RawMoveEntry[]) {
      const matching = entry.version_group_details.filter(
        (d) => d.version_group.name === versionGroup
      );
      if (matching.length === 0) continue;

      const methods = new Set(matching.map((d) => d.move_learn_method.name));

      if (methods.has("level-up")) result.levelUp.push(entry.move.name);
      if (methods.has("machine")) result.machine.push(entry.move.name);
      if (methods.has("tutor")) result.tutor.push(entry.move.name);
      if (methods.has("egg")) result.egg.push(entry.move.name);
    }

    return result;
  } catch (err) {
    console.error(`PokeAPI learnset request failed for species "${species}":`, err);
    return null;
  }
}
