import type { StatBlock } from "./types";

export interface ValidationError {
  field: string;
  message: string;
}

const STAT_KEYS: (keyof StatBlock)[] = ["hp", "atk", "def", "spa", "spd", "spe"];

export function validateLevel(level: number): ValidationError | null {
  if (!Number.isInteger(level) || level < 1 || level > 100) {
    return {
      field: "level",
      message: "Level must be a whole number between 1 and 100.",
    };
  }
  return null;
}

export function validateIVs(ivs: StatBlock): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const key of STAT_KEYS) {
    const value = ivs[key];
    if (!Number.isInteger(value) || value < 0 || value > 31) {
      errors.push({
        field: `iv_${key}`,
        message: `${key.toUpperCase()} IV must be a whole number between 0 and 31.`,
      });
    }
  }
  return errors;
}

export function validateEVs(evs: StatBlock): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const key of STAT_KEYS) {
    const value = evs[key];
    if (!Number.isInteger(value) || value < 0 || value > 252) {
      errors.push({
        field: `ev_${key}`,
        message: `${key.toUpperCase()} EV must be a whole number between 0 and 252.`,
      });
    }
  }
  const total = STAT_KEYS.reduce((sum, key) => sum + (evs[key] || 0), 0);
  if (total > 510) {
    errors.push({
      field: "evs",
      message: `Total EVs must not exceed 510 (got ${total}).`,
    });
  }
  return errors;
}

export function validateNature(
  nature: string,
  validNatureNames: string[]
): ValidationError | null {
  if (!validNatureNames.includes(nature)) {
    return { field: "nature", message: `"${nature}" is not a valid nature.` };
  }
  return null;
}

export function validateAbility(
  ability: string,
  validAbilities: string[]
): ValidationError | null {
  if (!validAbilities.includes(ability)) {
    return {
      field: "ability",
      message: `"${ability}" is not an ability this species can have.`,
    };
  }
  return null;
}

export function validateMoves(
  moves: string[],
  learnablePool: string[]
): ValidationError[] {
  const errors: ValidationError[] = [];
  if (moves.length > 4) {
    errors.push({ field: "moves", message: "A Pokémon can know at most 4 moves." });
  }
  for (const move of moves) {
    if (!learnablePool.includes(move)) {
      errors.push({
        field: "moves",
        message: `"${move}" is not a move this Pokémon can learn in this game.`,
      });
    }
  }
  return errors;
}
