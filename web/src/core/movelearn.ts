import path from "node:path";
import { GAME_TO_VERSION_GROUP } from "./versionGroups";
import { fetchCached, toApiSlug, type FetchCachedParams } from "./apiCache";
import type { LearnableMoves } from "./types";

const DEFAULT_CACHE_DIR = path.join(process.cwd(), ".cache", "pokeapi-moves");
const POKEAPI_BASE = "https://pokeapi.co/api/v2";

interface Options {
  cacheDir?: string;
  fetchImpl?: typeof fetch;
}

interface RawMoveEntry {
  move: { name: string };
  version_group_details: {
    version_group: { name: string };
    move_learn_method: { name: string };
  }[];
}

export async function getLearnableMoves(
  species: string,
  game: string,
  options: Options = {}
): Promise<LearnableMoves | null> {
  const versionGroup = GAME_TO_VERSION_GROUP[game];
  if (!versionGroup) return null;

  const cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;
  const fetchImpl = options.fetchImpl ?? fetch;
  const slug = toApiSlug(species);

  const params: FetchCachedParams<LearnableMoves> = {
    cacheKey: `${slug}-${versionGroup}`,
    cacheDir,
    url: `${POKEAPI_BASE}/pokemon/${encodeURIComponent(slug)}`,
    fetchImpl,
    errorLabel: `learnset for species "${species}"`,
    parse: (data) => {
      const d = data as { moves?: RawMoveEntry[] };
      if (!d.moves) return null;

      const result: LearnableMoves = { levelUp: [], machine: [], tutor: [], egg: [] };
      for (const entry of d.moves) {
        const matching = entry.version_group_details.filter(
          (v) => v.version_group.name === versionGroup
        );
        if (matching.length === 0) continue;

        const methods = new Set(matching.map((v) => v.move_learn_method.name));

        if (methods.has("level-up")) result.levelUp.push(entry.move.name);
        if (methods.has("machine")) result.machine.push(entry.move.name);
        if (methods.has("tutor")) result.tutor.push(entry.move.name);
        if (methods.has("egg")) result.egg.push(entry.move.name);
      }
      return result;
    },
  };

  return fetchCached<LearnableMoves>(params);
}
