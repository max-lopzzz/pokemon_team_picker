"use client";

import { useState } from "react";
import { getTeamRecommendationAction, type TeamRecommendation } from "./actions";

export default function RecommendTeamButton({
  gameName,
  encounterId,
}: {
  gameName: string;
  encounterId: number;
}) {
  const [recommendation, setRecommendation] = useState<TeamRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const result = await getTeamRecommendationAction(gameName, encounterId);
      if (!result) {
        setError("Couldn't load this encounter.");
      } else {
        setRecommendation(result);
      }
    } catch {
      setError("Something went wrong computing the recommendation.");
    } finally {
      setLoading(false);
    }
  }

  function describeSpeed(movesFirst: "attacker" | "defender" | "tie"): string {
    if (movesFirst === "attacker") return "you go first";
    if (movesFirst === "tie") return "speed tie";
    return "they go first";
  }

  function formatHits(n: number): string {
    return n >= 1000 ? "∞" : String(n);
  }

  return (
    <section>
      <button onClick={handleClick} disabled={loading}>
        {loading ? "Computing..." : "Recommend team"}
      </button>

      {error && <p>{error}</p>}

      {recommendation && (
        <div>
          {recommendation.assignments.length === 0 &&
            (recommendation.excludedRosterPokemon.length > 0 ||
              recommendation.uncoveredOpponents.every(
                (o) => o.reason === "no roster Pokémon available"
              )) && <p>Add Pokémon with moves to your roster to get a recommendation.</p>}

          {recommendation.assignments.length > 0 && (
            <ul>
              {recommendation.assignments.map((a) => (
                <li key={a.opponent.position}>
                  vs {a.opponent.species}: bring {a.species} using {a.move} —{" "}
                  {describeSpeed(a.summary.movesFirst)}, {formatHits(a.summary.myHitsToKO.min)}-
                  {formatHits(a.summary.myHitsToKO.max)} hits to KO them, they&apos;d need{" "}
                  {formatHits(a.summary.theirHitsToKoTaken.min)}-
                  {formatHits(a.summary.theirHitsToKoTaken.max)}
                </li>
              ))}
            </ul>
          )}

          {recommendation.uncoveredOpponents.length > 0 && (
            <div>
              <h3>Not covered</h3>
              <ul>
                {recommendation.uncoveredOpponents.map((o) => (
                  <li key={o.position}>
                    {o.species} — {o.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {recommendation.excludedRosterPokemon.length > 0 && (
            <div>
              <h3>Excluded from consideration</h3>
              <ul>
                {recommendation.excludedRosterPokemon.map((p) => (
                  <li key={p.id}>
                    {p.species} — {p.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
