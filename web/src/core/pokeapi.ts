import fs from "node:fs/promises";
import path from "node:path";
import type { SpeciesInfo } from "./types";

const DEFAULT_CACHE_DIR = path.join(process.cwd(), ".cache", "pokeapi");
const POKEAPI_BASE = "https://pokeapi.co/api/v2";

interface Options {
  cacheDir?: string;
  fetchImpl?: typeof fetch;
}

/** A sentinel cache entry written when a species lookup fails, so we don't
 * re-hit the network on every subsequent render for a permanently-missing
 * or misnamed species. */
interface CacheMiss {
  __miss: true;
}

type CacheEntry = SpeciesInfo | CacheMiss;

function isCacheMiss(entry: CacheEntry): entry is CacheMiss {
  return (entry as CacheMiss).__miss === true;
}

/**
 * Normalizes a species name into PokeAPI's slug format: lowercase, dots and
 * apostrophes stripped, whitespace collapsed to hyphens. E.g. "Mr. Mime" ->
 * "mr-mime", "Sirfetch'd" -> "sirfetchd".
 */
function toApiSlug(species: string): string {
  return species
    .toLowerCase()
    .replace(/[.']/g, "")
    .replace(/\s+/g, "-");
}

export async function getSpeciesInfo(
  species: string,
  options: Options = {}
): Promise<SpeciesInfo | null> {
  const cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;
  const fetchImpl = options.fetchImpl ?? fetch;

  const cached = await readCache(species, cacheDir);
  if (cached) {
    return isCacheMiss(cached) ? null : cached;
  }

  const fetched = await fetchSpeciesInfo(species, fetchImpl);
  try {
    await writeCache(species, cacheDir, fetched ?? { __miss: true });
  } catch (err) {
    console.error(
      `Failed to write cache for species "${species}":`,
      err instanceof Error ? err.message : String(err)
    );
  }
  return fetched;
}

function cacheFilePath(species: string, cacheDir: string): string {
  return path.join(cacheDir, `${toApiSlug(species)}.json`);
}

async function readCache(
  species: string,
  cacheDir: string
): Promise<CacheEntry | null> {
  try {
    const raw = await fs.readFile(cacheFilePath(species, cacheDir), "utf-8");
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

async function writeCache(
  species: string,
  cacheDir: string,
  entry: CacheEntry
): Promise<void> {
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(cacheFilePath(species, cacheDir), JSON.stringify(entry), "utf-8");
}

async function fetchSpeciesInfo(
  species: string,
  fetchImpl: typeof fetch
): Promise<SpeciesInfo | null> {
  try {
    const url = `${POKEAPI_BASE}/pokemon/${encodeURIComponent(toApiSlug(species))}`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      console.error(
        `PokeAPI request failed for species "${species}": HTTP ${res.status}`
      );
      return null;
    }

    const data = await res.json();
    return {
      name: species,
      types: data.types.map((t: { type: { name: string } }) => t.type.name),
      abilities: data.abilities.map(
        (a: { ability: { name: string } }) => a.ability.name
      ),
      spriteUrl: data.sprites?.front_default ?? null,
    };
  } catch (err) {
    console.error(
      `PokeAPI request failed for species "${species}":`,
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}
