import { listRoster } from "@/core/rosterQueries";
import { deleteRosterPokemonAction } from "./actions";
import AddPokemonForm from "./AddPokemonForm";

export default async function RosterPage({
  params,
}: {
  params: Promise<{ game: string }>;
}) {
  const { game } = await params;
  const gameName = decodeURIComponent(game);
  const roster = listRoster(gameName);

  return (
    <main>
      <h1>{gameName} Roster</h1>
      {roster.length === 0 && <p>No Pokémon in this roster yet.</p>}
      <ul>
        {roster.map((pokemon) => (
          <li key={pokemon.id}>
            <h2>
              {pokemon.species} (Lv. {pokemon.level})
            </h2>
            <p>Nature: {pokemon.nature}</p>
            <p>Ability: {pokemon.ability}</p>
            <p>Moves: {pokemon.moves.join(", ") || "none"}</p>
            <form action={deleteRosterPokemonAction.bind(null, gameName, pokemon.id)}>
              <button type="submit">Delete</button>
            </form>
          </li>
        ))}
      </ul>
      <AddPokemonForm game={gameName} />
    </main>
  );
}
