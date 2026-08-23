import Link from "next/link";
import { notFound } from "next/navigation";
import { listGyms } from "@/core/queries";

export default async function GamePage({
  params,
}: {
  params: Promise<{ game: string }>;
}) {
  const { game } = await params;
  const gameName = decodeURIComponent(game);
  const gyms = listGyms(gameName);

  if (gyms.length === 0) {
    notFound();
  }

  return (
    <main>
      <h1>{gameName}</h1>
      <ul>
        {gyms.map((gym) => (
          <li key={gym.id}>
            <Link
              href={`/${encodeURIComponent(gameName)}/${encodeURIComponent(gym.name)}`}
            >
              {gym.name}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
