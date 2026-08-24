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

/** PokeAPI's `past_types[].generation` names the LAST generation in which a
 * species had that typing — not the generation it "belongs to". The entry
 * with the earliest generation is therefore the species' original (Gen 1)
 * typing. E.g. Clefairy's only past_types entry is `generation-v` (Normal
 * held through Gen V, becoming Normal/Fairy in Gen VI) — that entry, not
 * one literally named `generation-i`, is the Gen 1-accurate one. */
const GENERATION_ORDER = [
  "generation-i",
  "generation-ii",
  "generation-iii",
  "generation-iv",
  "generation-v",
  "generation-vi",
  "generation-vii",
  "generation-viii",
  "generation-ix",
];

const GEN1_KNOWN_TYPES = new Set([
  "normal", "fighting", "flying", "poison", "ground", "rock", "bug",
  "ghost", "fire", "water", "grass", "electric", "psychic", "ice", "dragon",
]);

function earliestPastTypes(pastTypes: PastTypeEntry[]): string[] | null {
  let earliest: PastTypeEntry | null = null;
  let earliestIndex = Infinity;
  for (const entry of pastTypes) {
    const index = GENERATION_ORDER.indexOf(entry.generation.name);
    if (index !== -1 && index < earliestIndex) {
      earliest = entry;
      earliestIndex = index;
    }
  }
  return earliest ? earliest.types.map((t) => t.type.name) : null;
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

      const types =
        d.past_types && d.past_types.length > 0
          ? earliestPastTypes(d.past_types)
          : d.types.map((t) => t.type.name);

      if (!types) return null;

      // A resolved typing that includes a type that didn't exist in Gen 1
      // (Dark/Steel/Fairy) has no valid Gen 1 typing — treat it as a failed
      // lookup rather than silently returning modern types, which would
      // cause every matchup against it to fall back to neutral
      // effectiveness for the unrecognized type.
      if (!types.every((t) => GEN1_KNOWN_TYPES.has(t))) return null;

      return types;
    },
  };

  return fetchCached<string[]>(params);
}
