import path from "node:path";
import { fetchCached, toApiSlug, type FetchCachedParams } from "./apiCache";

const DEFAULT_CACHE_DIR = path.join(process.cwd(), ".cache", "pokeapi-gen1types");
const POKEAPI_BASE = "https://pokeapi.co/api/v2";

interface Options {
  cacheDir?: string;
  fetchImpl?: typeof fetch;
}

interface PastTypeEntry {
  generation: { name: string };
  types: { type: { name: string } }[];
}

export async function getGen1Types(
  species: string,
  options: Options = {}
): Promise<string[] | null> {
  const cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;
  const fetchImpl = options.fetchImpl ?? fetch;
  const slug = toApiSlug(species);

  const params: FetchCachedParams<string[]> = {
    cacheKey: slug,
    cacheDir,
    url: `${POKEAPI_BASE}/pokemon/${encodeURIComponent(slug)}`,
    fetchImpl,
    errorLabel: `Gen 1 types for species "${species}"`,
    parse: (data) => {
      const d = data as {
        types?: { type: { name: string } }[];
        past_types?: PastTypeEntry[];
      };
      if (!d.types) return null;

      const gen1Entry = d.past_types?.find(
        (entry) => entry.generation.name === "generation-i"
      );
      if (gen1Entry) {
        return gen1Entry.types.map((t) => t.type.name);
      }
      return d.types.map((t) => t.type.name);
    },
  };

  return fetchCached<string[]>(params);
}
