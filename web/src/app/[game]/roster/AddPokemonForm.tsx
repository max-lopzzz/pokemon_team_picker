"use client";

import { useState, type FormEvent } from "react";
import { addRosterPokemonAction, getSpeciesOptions, type SpeciesOptions } from "./actions";
import { NATURES } from "@/core/natures";
import type { ValidationError } from "@/core/rosterValidation";

const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;
type StatKey = (typeof STAT_KEYS)[number];

const DEFAULT_IVS: Record<StatKey, string> = {
  hp: "31",
  atk: "31",
  def: "31",
  spa: "31",
  spd: "31",
  spe: "31",
};

const DEFAULT_EVS: Record<StatKey, string> = {
  hp: "0",
  atk: "0",
  def: "0",
  spa: "0",
  spd: "0",
  spe: "0",
};

export default function AddPokemonForm({ game }: { game: string }) {
  const [species, setSpecies] = useState("");
  const [options, setOptions] = useState<SpeciesOptions | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [errors, setErrors] = useState<ValidationError[]>([]);

  const [level, setLevel] = useState("");
  const [nature, setNature] = useState("");
  const [ability, setAbility] = useState("");
  const [ivs, setIvs] = useState<Record<StatKey, string>>(DEFAULT_IVS);
  const [evs, setEvs] = useState<Record<StatKey, string>>(DEFAULT_EVS);
  const [moves, setMoves] = useState<string[]>([]);

  async function handleSpeciesBlur() {
    if (!species.trim()) {
      setOptions(null);
      setLookupFailed(false);
      return;
    }
    setLoadingOptions(true);
    setLookupFailed(false);
    const result = await getSpeciesOptions(species.trim(), game);
    setOptions(result);
    setLookupFailed(result === null);
    setLoadingOptions(false);
  }

  function toggleMove(move: string, checked: boolean) {
    setMoves((prev) =>
      checked ? [...prev, move] : prev.filter((m) => m !== move)
    );
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    // Use a plain onSubmit handler (instead of the `action` prop) so React
    // never applies its post-action form reset — that reset can clobber
    // <select>/checkbox elements even when they're controlled, wiping the
    // user's input on a validation error. Building FormData from the DOM
    // here is safe because every field is controlled and already reflects
    // component state.
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const result = await addRosterPokemonAction(game, formData);
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    setSpecies("");
    setOptions(null);
    setLookupFailed(false);
    setLevel("");
    setNature("");
    setAbility("");
    setIvs(DEFAULT_IVS);
    setEvs(DEFAULT_EVS);
    setMoves([]);
  }

  const learnablePool = options?.moves
    ? [
        ...options.moves.levelUp.map((m) => ({ move: m, method: "Level-up" })),
        ...options.moves.machine.map((m) => ({ move: m, method: "TM/HM" })),
        ...options.moves.tutor.map((m) => ({ move: m, method: "Tutor" })),
        ...options.moves.egg.map((m) => ({ move: m, method: "Egg" })),
      ]
    : [];

  return (
    <form onSubmit={handleSubmit}>
      <h2>Add Pokémon</h2>

      {errors.length > 0 && (
        <ul>
          {errors.map((e, i) => (
            <li key={i}>{e.message}</li>
          ))}
        </ul>
      )}

      <label>
        Species
        <input
          name="species"
          value={species}
          onChange={(e) => {
            setSpecies(e.target.value);
            setLookupFailed(false);
          }}
          onBlur={handleSpeciesBlur}
          required
        />
      </label>

      {loadingOptions && <p>Looking up species...</p>}
      {lookupFailed && !loadingOptions && (
        <p role="alert">
          Could not find that Pokémon species — check the spelling and try again.
        </p>
      )}

      <label>
        Level
        <input
          name="level"
          type="number"
          min={1}
          max={100}
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          required
        />
      </label>

      <label>
        Nature
        <select
          name="nature"
          required
          value={nature}
          onChange={(e) => setNature(e.target.value)}
        >
          <option value="" disabled>
            Choose a nature
          </option>
          {NATURES.map((n) => (
            <option key={n.name} value={n.name}>
              {n.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        Ability
        <select
          name="ability"
          required
          disabled={!options}
          value={ability}
          onChange={(e) => setAbility(e.target.value)}
        >
          <option value="" disabled>
            Choose an ability
          </option>
          {options?.abilities.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend>IVs (0-31)</legend>
        {STAT_KEYS.map((stat) => (
          <label key={stat}>
            {stat.toUpperCase()}
            <input
              name={`iv_${stat}`}
              type="number"
              min={0}
              max={31}
              value={ivs[stat]}
              onChange={(e) =>
                setIvs((prev) => ({ ...prev, [stat]: e.target.value }))
              }
              required
            />
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>EVs (0-252, total &le; 510)</legend>
        {STAT_KEYS.map((stat) => (
          <label key={stat}>
            {stat.toUpperCase()}
            <input
              name={`ev_${stat}`}
              type="number"
              min={0}
              max={252}
              value={evs[stat]}
              onChange={(e) =>
                setEvs((prev) => ({ ...prev, [stat]: e.target.value }))
              }
              required
            />
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Moveset (up to 4)</legend>
        {learnablePool.length === 0 && <p>Enter a species to see learnable moves.</p>}
        {learnablePool.map(({ move, method }) => (
          <label key={`${method}-${move}`}>
            <input
              type="checkbox"
              name="moves"
              value={move}
              checked={moves.includes(move)}
              onChange={(e) => toggleMove(move, e.target.checked)}
            />
            {move} ({method})
          </label>
        ))}
      </fieldset>

      <button type="submit" disabled={!options}>
        Add to roster
      </button>
    </form>
  );
}
