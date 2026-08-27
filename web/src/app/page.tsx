import Link from "next/link";
import { listGenerations, listGames } from "@/core/queries";

export default function HomePage() {
  const generations = listGenerations();

  return (
    <main>
      <h1>Pokémon Team Picker</h1>
      {generations.map((gen) => {
        const games = listGames(gen.number);
        return (
          <section key={gen.id}>
            <h2>Generation {gen.number}</h2>
            <ul>
              {games.map((game) => (
                <li key={game.id}>
                  <Link href={`/${encodeURIComponent(game.name)}`}>
                    {game.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
