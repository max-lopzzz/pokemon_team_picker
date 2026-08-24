import path from "node:path";
import { fetchCached, toApiSlug, type FetchCachedParams } from "./apiCache";
import type { MoveData } from "./types";

const DEFAULT_CACHE_DIR = path.join(process.cwd(), ".cache", "pokeapi-movedata");
const POKEAPI_BASE = "https://pokeapi.co/api/v2";

interface Options {
  cacheDir?: string;
  fetchImpl?: typeof fetch;
}

export async function getMoveData(
  moveName: string,
  options: Options = {}
): Promise<MoveData | null> {
  const cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;
  const fetchImpl = options.fetchImpl ?? fetch;
  const slug = toApiSlug(moveName);

  const params: FetchCachedParams<MoveData> = {
    cacheKey: slug,
    cacheDir,
    url: `${POKEAPI_BASE}/move/${encodeURIComponent(slug)}`,
    fetchImpl,
    errorLabel: `move "${moveName}"`,
    parse: (data) => {
      const d = data as {
        type?: { name: string };
        damage_class?: { name: string };
        power: number | null;
        priority: number;
        meta?: { crit_rate: number };
      };
      if (!d.type || !d.damage_class) return null;

      const category = d.damage_class.name;
      if (category !== "physical" && category !== "special" && category !== "status") {
        return null;
      }

      return {
        name: moveName,
        type: d.type.name,
        category,
        power: d.power,
        priority: d.priority,
        highCritRate: (d.meta?.crit_rate ?? 0) > 0,
      };
    },
  };

  return fetchCached<MoveData>(params);
}
