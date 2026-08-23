import fs from "node:fs/promises";
import path from "node:path";
import { toApiSlug } from "./pokeapi";
import type { MoveData } from "./types";

const DEFAULT_CACHE_DIR = path.join(process.cwd(), ".cache", "pokeapi-movedata");
const POKEAPI_BASE = "https://pokeapi.co/api/v2";

interface Options {
  cacheDir?: string;
  fetchImpl?: typeof fetch;
}

interface CacheMiss {
  __miss: true;
}

type CacheEntry = MoveData | CacheMiss;

function isCacheMiss(entry: CacheEntry): entry is CacheMiss {
  return (entry as CacheMiss).__miss === true;
}

export async function getMoveData(
  moveName: string,
  options: Options = {}
): Promise<MoveData | null> {
  const cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;
  const fetchImpl = options.fetchImpl ?? fetch;
  const cacheKey = toApiSlug(moveName);

  const cached = await readCache(cacheKey, cacheDir);
  if (cached) {
    return isCacheMiss(cached) ? null : cached;
  }

  const fetched = await fetchMoveData(moveName, fetchImpl);
  try {
    await writeCache(cacheKey, cacheDir, fetched ?? { __miss: true });
  } catch (err) {
    console.error(`Failed to cache move data for "${moveName}":`, err);
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

async function fetchMoveData(
  moveName: string,
  fetchImpl: typeof fetch
): Promise<MoveData | null> {
  try {
    const res = await fetchImpl(
      `${POKEAPI_BASE}/move/${encodeURIComponent(toApiSlug(moveName))}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) {
      console.error(
        `PokeAPI move-data request failed for move "${moveName}": HTTP ${res.status}`
      );
      return null;
    }

    const data = await res.json();
    const category = data.damage_class.name;
    if (category !== "physical" && category !== "special" && category !== "status") {
      console.error(
        `PokeAPI move-data response for "${moveName}" has an unexpected damage class: "${category}"`
      );
      return null;
    }

    return {
      name: moveName,
      type: data.type.name,
      category,
      power: data.power,
      priority: data.priority,
    };
  } catch (err) {
    console.error(`PokeAPI move-data request failed for move "${moveName}":`, err);
    return null;
  }
}
