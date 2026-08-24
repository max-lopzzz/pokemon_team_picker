import path from "node:path";
import { fetchCached, toApiSlug, type FetchCachedParams } from "./apiCache";

const DEFAULT_CACHE_DIR = path.join(process.cwd(), ".cache", "pokeapi-historicaltypes");
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
 * species had that typing — not the generation it "belongs to". The typing
 * effective during a target generation G is therefore the entry with the
 * SMALLEST generation number that is >= G (the first recorded checkpoint
 * not yet superseded by G); if no such entry exists, G is more recent than
 * every recorded change, so the current typing applies. */
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

/** The generation each type was introduced in — used to reject a resolved
 * typing that includes a type that didn't exist yet as of the target
 * generation (e.g. Fairy before Gen 6, or Dark/Steel before Gen 2). */
const TYPE_INTRO_GENERATION: Record<string, number> = {
  normal: 1, fighting: 1, flying: 1, poison: 1, ground: 1, rock: 1, bug: 1,
  ghost: 1, fire: 1, water: 1, grass: 1, electric: 1, psychic: 1, ice: 1,
  dragon: 1,
  dark: 2, steel: 2,
  fairy: 6,
};

function isValidTypeForGeneration(type: string, generation: number): boolean {
  const introGeneration = TYPE_INTRO_GENERATION[type];
  return introGeneration !== undefined && introGeneration <= generation;
}

function typesForGeneration(
  pastTypes: PastTypeEntry[],
  generation: number
): string[] | null {
  let best: PastTypeEntry | null = null;
  let bestIndex = Infinity;
  for (const entry of pastTypes) {
    const index = GENERATION_ORDER.indexOf(entry.generation.name);
    if (index === -1) continue;
    const entryGeneration = index + 1;
    if (entryGeneration >= generation && index < bestIndex) {
      best = entry;
      bestIndex = index;
    }
  }
  return best ? best.types.map((t) => t.type.name) : null;
}

/** Resolves a species' typing as it was during a specific generation,
 * using PokeAPI's `past_types` field. Falls back to the species' current
 * types when no historical entry covers the target generation. Returns
 * `null` if the resolved typing includes a type that didn't exist yet as
 * of that generation — this represents "no valid typing could be
 * determined" rather than silently returning an anachronistic type. */
export async function getHistoricalTypes(
  species: string,
  generation: number,
  options: Options = {}
): Promise<string[] | null> {
  const cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;
  const fetchImpl = options.fetchImpl ?? fetch;
  const slug = toApiSlug(species);

  const params: FetchCachedParams<string[]> = {
    cacheKey: `${slug}-gen${generation}`,
    cacheDir,
    url: `${POKEAPI_BASE}/pokemon/${encodeURIComponent(slug)}`,
    fetchImpl,
    errorLabel: `Gen ${generation} types for species "${species}"`,
    parse: (data) => {
      const d = data as {
        types?: { type: { name: string } }[];
        past_types?: PastTypeEntry[];
      };
      if (!d.types) return null;

      let types: string[] | null = null;
      if (d.past_types && d.past_types.length > 0) {
        types = typesForGeneration(d.past_types, generation);
      }
      if (!types) {
        types = d.types.map((t) => t.type.name);
      }

      if (!types.every((t) => isValidTypeForGeneration(t, generation))) return null;

      return types;
    },
  };

  return fetchCached<string[]>(params);
}

/** Gen 1-specific convenience wrapper — see `getHistoricalTypes`. */
export async function getGen1Types(
  species: string,
  options: Options = {}
): Promise<string[] | null> {
  return getHistoricalTypes(species, 1, options);
}
