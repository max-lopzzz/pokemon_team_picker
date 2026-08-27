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

export interface StatBlock {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

export interface Nature {
  name: string;
  plus: "atk" | "def" | "spa" | "spd" | "spe" | null;
  minus: "atk" | "def" | "spa" | "spd" | "spe" | null;
}

export interface RosterPokemon {
  id: number;
  game: string;
  species: string;
  level: number;
  nature: string;
  ability: string;
  ivs: StatBlock;
  evs: StatBlock;
  moves: string[];
}

export interface NewRosterPokemon {
  game: string;
  species: string;
  level: number;
  nature: string;
  ability: string;
  ivs: StatBlock;
  evs: StatBlock;
  moves: string[];
}

export interface LearnableMoves {
  levelUp: string[];
  machine: string[];
  tutor: string[];
  egg: string[];
}

export interface MoveData {
  name: string;
  type: string;
  category: "physical" | "special" | "status";
  power: number | null;
  priority: number;
  highCritRate: boolean;
}
