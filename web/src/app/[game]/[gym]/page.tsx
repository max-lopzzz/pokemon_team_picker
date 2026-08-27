import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { listEncounters } from "@/core/queries";

export default async function GymPage({
  params,
}: {
  params: Promise<{ game: string; gym: string }>;
}) {
  const { game, gym } = await params;
  const gameName = decodeURIComponent(game);
  const gymName = decodeURIComponent(gym);
  const encounters = listEncounters(gameName, gymName);

  if (encounters.length === 0) {
    notFound();
  }

  if (encounters.length === 1) {
    redirect(
      `/${encodeURIComponent(gameName)}/${encodeURIComponent(gymName)}/${encounters[0].id}`
    );
  }

  return (
    <main>
      <h1>{gymName}</h1>
      <ul>
        {encounters.map((encounter) => (
          <li key={encounter.id}>
            <Link
              href={`/${encodeURIComponent(gameName)}/${encodeURIComponent(gymName)}/${encounter.id}`}
            >
              {encounter.leaderName}
              {encounter.variant ? ` — ${encounter.variant}` : ""}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
