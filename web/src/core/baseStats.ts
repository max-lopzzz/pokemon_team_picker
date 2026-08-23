import fs from "node:fs/promises";
import path from "node:path";
import { toApiSlug } from "./pokeapi";
import type { StatBlock } from "./types";

const DEFAULT_CACHE_DIR = path.join(process.cwd(), ".cache", "pokeapi-basestats");
const POKEAPI_BASE = "https://pokeapi.co/api/v2";

interface Options {
  cacheDir?: string;
  fetchImpl?: typeof fetch;
}

interface CacheMiss {
  __miss: true;
}

type CacheEntry = StatBlock | CacheMiss;

function isCacheMiss(entry: CacheEntry): entry is CacheMiss {
  return (entry as CacheMiss).__miss === true;
}

const STAT_NAME_MAP: Record<string, keyof StatBlock> = {
  hp: "hp",
  attack: "atk",
  defense: "def",
  "special-attack": "spa",
  "special-defense": "spd",
  speed: "spe",
};

export async function getBaseStats(
  species: string,
  options: Options = {}
): Promise<StatBlock | null> {
  const cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;
  const fetchImpl = options.fetchImpl ?? fetch;
  const cacheKey = toApiSlug(species);

  const cached = await readCache(cacheKey, cacheDir);
  if (cached) {
    return isCacheMiss(cached) ? null : cached;
  }

  const fetched = await fetchBaseStats(species, fetchImpl);
  try {
    await writeCache(cacheKey, cacheDir, fetched ?? { __miss: true });
  } catch (err) {
    console.error(`Failed to cache base stats for "${species}":`, err);
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

async function fetchBaseStats(
  species: string,
  fetchImpl: typeof fetch
): Promise<StatBlock | null> {
  try {
    const res = await fetchImpl(
      `${POKEAPI_BASE}/pokemon/${encodeURIComponent(toApiSlug(species))}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) {
      console.error(
        `PokeAPI base-stats request failed for species "${species}": HTTP ${res.status}`
      );
      return null;
    }

    const data = await res.json();
    const stats: Partial<StatBlock> = {};
    for (const entry of data.stats as { base_stat: number; stat: { name: string } }[]) {
      const key = STAT_NAME_MAP[entry.stat.name];
      if (key) stats[key] = entry.base_stat;
    }

    if (
      stats.hp === undefined ||
      stats.atk === undefined ||
      stats.def === undefined ||
      stats.spa === undefined ||
      stats.spd === undefined ||
      stats.spe === undefined
    ) {
      console.error(
        `PokeAPI base-stats response for "${species}" is missing expected stats`
      );
      return null;
    }

    return stats as StatBlock;
  } catch (err) {
    console.error(`PokeAPI base-stats request failed for species "${species}":`, err);
    return null;
  }
}
