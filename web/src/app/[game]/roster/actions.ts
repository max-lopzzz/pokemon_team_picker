"use server";

import { revalidatePath } from "next/cache";
import { getSpeciesInfo } from "@/core/pokeapi";
import { getLearnableMoves } from "@/core/movelearn";
import { NATURES } from "@/core/natures";
import {
  validateLevel,
  validateIVs,
  validateEVs,
  validateNature,
  validateAbility,
  validateMoves,
  type ValidationError,
} from "@/core/rosterValidation";
import {
  addRosterPokemon,
  deleteRosterPokemon as deleteRosterPokemonQuery,
} from "@/core/rosterQueries";
import type { LearnableMoves, StatBlock } from "@/core/types";

export interface SpeciesOptions {
  abilities: string[];
  moves: LearnableMoves | null;
}

export async function getSpeciesOptions(
  species: string,
  game: string
): Promise<SpeciesOptions | null> {
  const info = await getSpeciesInfo(species);
  if (!info) return null;
  const moves = await getLearnableMoves(species, game);
  return { abilities: info.abilities, moves };
}

export interface AddRosterPokemonResult {
  success: boolean;
  errors: ValidationError[];
}

export async function addRosterPokemonAction(
  game: string,
  formData: FormData
): Promise<AddRosterPokemonResult> {
  const species = String(formData.get("species") ?? "").trim();
  const level = Number(formData.get("level"));
  const nature = String(formData.get("nature") ?? "");
  const ability = String(formData.get("ability") ?? "");
  // Dedupe here: the same move can be checked via two different learn-method
  // checkboxes (e.g. both "Level-up" and "TM/HM"), but it's still one move.
  const moves = [...new Set(formData.getAll("moves").map(String))];

  const readStat = (prefix: "iv" | "ev", stat: keyof StatBlock) =>
    Number(formData.get(`${prefix}_${stat}`));

  const ivs: StatBlock = {
    hp: readStat("iv", "hp"),
    atk: readStat("iv", "atk"),
    def: readStat("iv", "def"),
    spa: readStat("iv", "spa"),
    spd: readStat("iv", "spd"),
    spe: readStat("iv", "spe"),
  };
  const evs: StatBlock = {
    hp: readStat("ev", "hp"),
    atk: readStat("ev", "atk"),
    def: readStat("ev", "def"),
    spa: readStat("ev", "spa"),
    spd: readStat("ev", "spd"),
    spe: readStat("ev", "spe"),
  };

  const errors: ValidationError[] = [];

  const speciesInfo = await getSpeciesInfo(species);
  if (!speciesInfo) {
    errors.push({
      field: "species",
      message: `"${species}" is not a recognized Pokémon species.`,
    });
  }

  const levelError = validateLevel(level);
  if (levelError) errors.push(levelError);

  errors.push(...validateIVs(ivs));
  errors.push(...validateEVs(evs));

  const natureError = validateNature(nature, NATURES.map((n) => n.name));
  if (natureError) errors.push(natureError);

  if (speciesInfo) {
    const abilityError = validateAbility(ability, speciesInfo.abilities);
    if (abilityError) errors.push(abilityError);
  }

  const learnable = speciesInfo ? await getLearnableMoves(species, game) : null;
  if (learnable) {
    const pool = [
      ...learnable.levelUp,
      ...learnable.machine,
      ...learnable.tutor,
      ...learnable.egg,
    ];
    errors.push(...validateMoves(moves, pool));
  } else if (moves.length > 0) {
    errors.push({
      field: "moves",
      message: "Could not verify learnable moves for this species/game.",
    });
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  addRosterPokemon({ game, species, level, nature, ability, ivs, evs, moves });
  revalidatePath(`/${encodeURIComponent(game)}/roster`);
  return { success: true, errors: [] };
}

export async function deleteRosterPokemonAction(
  game: string,
  id: number
): Promise<void> {
  deleteRosterPokemonQuery(id);
  revalidatePath(`/${encodeURIComponent(game)}/roster`);
}
