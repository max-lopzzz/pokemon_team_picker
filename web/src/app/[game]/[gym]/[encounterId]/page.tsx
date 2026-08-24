import { notFound } from "next/navigation";
import { getEncounterTeam, listEncounters } from "@/core/queries";
import { getSpeciesInfo } from "@/core/pokeapi";
import RecommendTeamButton from "./RecommendTeamButton";

export default async function EncounterPage({
  params,
}: {
  params: Promise<{ game: string; gym: string; encounterId: string }>;
}) {
  const { game, gym, encounterId } = await params;
  const gameName = decodeURIComponent(game);
  const gymName = decodeURIComponent(gym);
  const team = getEncounterTeam(Number(encounterId));

  if (!team) {
    notFound();
  }

  const encounters = listEncounters(gameName, gymName);
  if (!encounters.some((e) => e.id === team.encounter.id)) {
    notFound();
  }

  const enriched = await Promise.all(
    team.pokemon.map(async (p) => ({
      ...p,
      info: await getSpeciesInfo(p.species),
    }))
  );

  return (
    <main>
      <h1>
        {team.encounter.leaderName}
        {team.encounter.variant ? ` — ${team.encounter.variant}` : ""}
      </h1>
      <ul>
        {enriched.map((p) => (
          <li key={p.id}>
            <h2>
              {p.species}
              {p.gender && p.gender !== "N/A" ? ` (${p.gender})` : ""}
            </h2>
            {p.level !== null && <p>Level {p.level}</p>}
            {p.info && <p>Type: {p.info.types.join(", ")}</p>}
            {p.info && <p>Abilities: {p.info.abilities.join(", ")}</p>}
            <p>Moves: {p.moves.join(", ")}</p>
            {p.heldItem && <p>Held item: {p.heldItem}</p>}
            {p.dynamax && <p>Dynamax: {p.dynamax}</p>}
          </li>
        ))}
      </ul>
      <RecommendTeamButton gameName={gameName} encounterId={team.encounter.id} />
    </main>
  );
}
