import path from "node:path";
import { fetchCached, toApiSlug, type FetchCachedParams } from "./apiCache";
import type { SpeciesInfo } from "./types";

export { toApiSlug };

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
  const slug = toApiSlug(species);

  const params: FetchCachedParams<SpeciesInfo> = {
    cacheKey: slug,
    cacheDir,
    url: `${POKEAPI_BASE}/pokemon/${encodeURIComponent(slug)}`,
    fetchImpl,
    errorLabel: `species "${species}"`,
    parse: (data) => {
      const d = data as {
        types?: { type: { name: string } }[];
        abilities?: { ability: { name: string } }[];
        sprites?: { front_default?: string | null };
      };
      if (!d.types || !d.abilities) return null;
      return {
        name: species,
        types: d.types.map((t) => t.type.name),
        abilities: d.abilities.map((a) => a.ability.name),
        spriteUrl: d.sprites?.front_default ?? null,
      };
    },
  };

  return fetchCached<SpeciesInfo>(params);
}
