import path from "node:path";
import { fetchCached, toApiSlug, type FetchCachedParams } from "./apiCache";
import type { StatBlock } from "./types";

const DEFAULT_CACHE_DIR = path.join(process.cwd(), ".cache", "pokeapi-basestats");
const POKEAPI_BASE = "https://pokeapi.co/api/v2";

interface Options {
  cacheDir?: string;
  fetchImpl?: typeof fetch;
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
  const slug = toApiSlug(species);

  const params: FetchCachedParams<StatBlock> = {
    cacheKey: slug,
    cacheDir,
    url: `${POKEAPI_BASE}/pokemon/${encodeURIComponent(slug)}`,
    fetchImpl,
    errorLabel: `base stats for species "${species}"`,
    parse: (data) => {
      const d = data as { stats?: { base_stat: number; stat: { name: string } }[] };
      if (!d.stats) return null;

      const stats: Partial<StatBlock> = {};
      for (const entry of d.stats) {
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
        return null;
      }

      return stats as StatBlock;
    },
  };

  return fetchCached<StatBlock>(params);
}
