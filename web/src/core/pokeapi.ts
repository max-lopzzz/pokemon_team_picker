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
  if (fetched) {
    try {
      await writeCache(species, cacheDir, fetched);
    } catch (err) {
      console.error(
        `Failed to write cache for species "${species}":`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }
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
