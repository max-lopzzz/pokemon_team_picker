export interface Generation {
  id: number;
  number: number;
}

export interface Game {
  id: number;
  name: string;
  generationId: number;
}

export interface Gym {
  id: number;
  name: string;
  gameId: number;
}

export interface Encounter {
  id: number;
  gameId: number;
  gymId: number;
  leaderId: number;
  leaderName: string;
  variant: string | null;
}

export interface EncounterPokemon {
  id: number;
  position: number;
  species: string;
  level: number | null;
  gender: string | null;
  heldItem: string | null;
  dynamax: string | null;
  moves: string[];
}

export interface EncounterTeam {
  encounter: Encounter;
  pokemon: EncounterPokemon[];
}

export interface SpeciesInfo {
  name: string;
  types: string[];
  abilities: string[];
  spriteUrl: string | null;
}
