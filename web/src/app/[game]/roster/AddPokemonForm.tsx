"use client";

import { useState } from "react";
import { addRosterPokemonAction, getSpeciesOptions, type SpeciesOptions } from "./actions";
import { NATURES } from "@/core/natures";
import type { ValidationError } from "@/core/rosterValidation";

const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;

export default function AddPokemonForm({ game }: { game: string }) {
  const [species, setSpecies] = useState("");
  const [options, setOptions] = useState<SpeciesOptions | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [errors, setErrors] = useState<ValidationError[]>([]);

  async function handleSpeciesBlur() {
    if (!species.trim()) {
      setOptions(null);
      return;
    }
    setLoadingOptions(true);
    const result = await getSpeciesOptions(species.trim(), game);
    setOptions(result);
    setLoadingOptions(false);
  }

  async function handleSubmit(formData: FormData) {
    const result = await addRosterPokemonAction(game, formData);
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    setSpecies("");
    setOptions(null);
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
    <form action={handleSubmit}>
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
          onChange={(e) => setSpecies(e.target.value)}
          onBlur={handleSpeciesBlur}
          required
        />
      </label>

      {loadingOptions && <p>Looking up species...</p>}

      <label>
        Level
        <input name="level" type="number" min={1} max={100} required />
      </label>

      <label>
        Nature
        <select name="nature" required defaultValue="">
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
        <select name="ability" required disabled={!options} defaultValue="">
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
              defaultValue={31}
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
              defaultValue={0}
              required
            />
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Moveset (up to 4)</legend>
        {learnablePool.length === 0 && <p>Enter a species to see learnable moves.</p>}
        {learnablePool.map(({ move, method }) => (
          <label key={move}>
            <input type="checkbox" name="moves" value={move} />
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
