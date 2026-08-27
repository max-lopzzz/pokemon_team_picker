import { describe, it, expect } from "vitest";
import { scoreMatchup, assembleTeam, type MatchupScore } from "./recommendation";
import type { NormalizedMatchup } from "./matchupEngines";
import type { RosterPokemon, EncounterPokemon } from "./types";

const zeroStats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

function rosterMon(id: number, species: string): RosterPokemon {
  return {
    id,
    game: "Red",
    species,
    level: 50,
    nature: "Hardy",
    ability: "Static",
    ivs: zeroStats,
    evs: zeroStats,
    moves: ["Move"],
  };
}

function opponentMon(position: number, species: string): EncounterPokemon {
  return {
    id: position,
    position,
    species,
    level: 50,
    gender: null,
    heldItem: null,
    dynamax: null,
    moves: ["Move"],
  };
}

describe("scoreMatchup", () => {
  it("computes the score from the average of the range plus a speed bonus", () => {
    const myMatchups = [
      { move: "A", result: { hitsToKO: { min: 2, max: 3 }, movesFirst: "attacker" as const } },
    ];
    const theirMatchups: NormalizedMatchup[] = [
      { hitsToKO: { min: 4, max: 5 }, movesFirst: "attacker" },
    ];

    const result = scoreMatchup(myMatchups, theirMatchups);

    // theirAvg=4.5, myAvg=2.5, speedBonus=0.5 (movesFirst="attacker") -> score=(4.5-2.5)+0.5=2.5
    expect(result).toEqual({
      score: 2.5,
      move: "A",
      myHitsToKO: { min: 2, max: 3 },
      theirHitsToKoTaken: { min: 4, max: 5 },
      movesFirst: "attacker",
    });
  });

  it("picks the best-scoring of several of my candidate moves", () => {
    const myMatchups = [
      { move: "Weak", result: { hitsToKO: { min: 5, max: 6 }, movesFirst: "attacker" as const } },
      { move: "Strong", result: { hitsToKO: { min: 2, max: 2 }, movesFirst: "attacker" as const } },
    ];
    const theirMatchups: NormalizedMatchup[] = [
      { hitsToKO: { min: 4, max: 4 }, movesFirst: "attacker" },
    ];

    const result = scoreMatchup(myMatchups, theirMatchups);

    // Weak: (4-5.5)+0.5=-1.0. Strong: (4-2)+0.5=2.5. Strong wins.
    expect(result!.move).toBe("Strong");
    expect(result!.score).toBe(2.5);
  });

  it("picks the worst-case (fewest hits, most dangerous) of their candidate moves", () => {
    const myMatchups = [
      { move: "M", result: { hitsToKO: { min: 3, max: 3 }, movesFirst: "attacker" as const } },
    ];
    const theirMatchups: NormalizedMatchup[] = [
      { hitsToKO: { min: 6, max: 6 }, movesFirst: "attacker" }, // less dangerous
      { hitsToKO: { min: 2, max: 2 }, movesFirst: "attacker" }, // more dangerous
    ];

    const result = scoreMatchup(myMatchups, theirMatchups);

    expect(result!.theirHitsToKoTaken).toEqual({ min: 2, max: 2 });
    // theirAvg=2, myAvg=3, speedBonus=0.5 -> score=(2-3)+0.5=-0.5
    expect(result!.score).toBe(-0.5);
  });

  it("applies the correct speed bonus for each movesFirst value", () => {
    const theirMatchups: NormalizedMatchup[] = [
      { hitsToKO: { min: 4, max: 4 }, movesFirst: "attacker" },
    ];

    const attackerFirst = scoreMatchup(
      [{ move: "M", result: { hitsToKO: { min: 2, max: 2 }, movesFirst: "attacker" } }],
      theirMatchups
    );
    const tie = scoreMatchup(
      [{ move: "M", result: { hitsToKO: { min: 2, max: 2 }, movesFirst: "tie" } }],
      theirMatchups
    );
    const defenderFirst = scoreMatchup(
      [{ move: "M", result: { hitsToKO: { min: 2, max: 2 }, movesFirst: "defender" } }],
      theirMatchups
    );

    // Base (4-2) = 2, then +0.5 / +0 / -0.5.
    expect(attackerFirst!.score).toBe(2.5);
    expect(tie!.score).toBe(2);
    expect(defenderFirst!.score).toBe(1.5);
  });

  it("returns null when I have no usable moves against this opponent", () => {
    const theirMatchups: NormalizedMatchup[] = [
      { hitsToKO: { min: 4, max: 4 }, movesFirst: "attacker" },
    ];
    expect(scoreMatchup([], theirMatchups)).toBeNull();
  });

  it("returns null when the opponent has no usable moves against me", () => {
    const myMatchups = [
      { move: "M", result: { hitsToKO: { min: 2, max: 2 }, movesFirst: "attacker" as const } },
    ];
    expect(scoreMatchup(myMatchups, [])).toBeNull();
  });

  it("clamps a genuine double-immunity case (both sides Infinity) without producing NaN", () => {
    const myMatchups = [
      { move: "M", result: { hitsToKO: { min: Infinity, max: Infinity }, movesFirst: "attacker" as const } },
    ];
    const theirMatchups: NormalizedMatchup[] = [
      { hitsToKO: { min: Infinity, max: Infinity }, movesFirst: "attacker" },
    ];

    const result = scoreMatchup(myMatchups, theirMatchups);

    expect(result).not.toBeNull();
    expect(result!.score).not.toBeNaN();
    expect(result!.myHitsToKO).toEqual({ min: 1000, max: 1000 });
    expect(result!.theirHitsToKoTaken).toEqual({ min: 1000, max: 1000 });
    // (1000-1000)+0.5 = 0.5
    expect(result!.score).toBe(0.5);
  });
});

describe("assembleTeam", () => {
  it("uses bottleneck-first assignment to achieve full coverage where naive left-to-right would leave a gap", () => {
    // Roster: A (id 1), B (id 2), C (id 3). Opponents: X, Y, Z (positions 1,2,3).
    // A beats X well (10) and Y well (8). B beats Y okay (5) but is the
    // ONLY one who can score Z at all (3). C is weak everywhere it scores
    // (X:1, Y:2) and cannot score Z at all (null).
    //
    // Naive left-to-right (X, Y, Z in order): X->A(10), Y->B(5) [A used],
    // Z-> only C left, but C has no score for Z -> Z UNCOVERED.
    //
    // Bottleneck-first: Z's best-available score (3, only B) is the
    // lowest of any opponent's best-available score in the first pass,
    // so Z is assigned first (to B), reserving B before it could be
    // claimed by Y. Then Y's best-available (8, A) beats X's (10, A) as
    // the next-lowest remaining bottleneck... actually X's best (10) >
    // Y's best (8), so Y is the next bottleneck -> Y gets A. Finally X
    // gets whichever roster Pokémon is left: C (1). All three covered.
    function mockScore(score: number, move: string): MatchupScore {
      return {
        score,
        move,
        myHitsToKO: { min: 1, max: 1 },
        theirHitsToKoTaken: { min: 1, max: 1 },
        movesFirst: "attacker",
      };
    }

    const roster = [rosterMon(1, "A"), rosterMon(2, "B"), rosterMon(3, "C")];
    const opponents = [opponentMon(1, "X"), opponentMon(2, "Y"), opponentMon(3, "Z")];

    // scoreMatrix[rosterIndex][opponentIndex]
    const scoreMatrix: (MatchupScore | null)[][] = [
      [mockScore(10, "m1"), mockScore(8, "m2"), null], // A vs X, Y, Z
      [null, mockScore(5, "m3"), mockScore(3, "m4")], // B vs X, Y, Z
      [mockScore(1, "m5"), mockScore(2, "m6"), null], // C vs X, Y, Z
    ];

    const result = assembleTeam(scoreMatrix, roster, opponents);

    expect(result.uncoveredOpponents).toEqual([]);
    expect(result.assignments).toHaveLength(3);

    const byOpponent = (species: string) =>
      result.assignments.find((a) => a.opponent.species === species)!;

    expect(byOpponent("Z").species).toBe("B");
    expect(byOpponent("Z").move).toBe("m4");
    expect(byOpponent("Y").species).toBe("A");
    expect(byOpponent("Y").move).toBe("m2");
    expect(byOpponent("X").species).toBe("C");
    expect(byOpponent("X").move).toBe("m5");
  });

  it("marks an opponent with zero scoreable roster Pokémon as uncovered immediately", () => {
    const roster = [rosterMon(1, "A")];
    const opponents = [opponentMon(1, "X")];
    const scoreMatrix: (MatchupScore | null)[][] = [[null]];

    const result = assembleTeam(scoreMatrix, roster, opponents);

    expect(result.assignments).toEqual([]);
    expect(result.uncoveredOpponents).toEqual([
      { species: "X", position: 1, reason: "no roster Pokémon scored a usable matchup" },
    ]);
  });

  it("marks an opponent uncovered when the roster runs out mid-assignment", () => {
    // Only one roster Pokémon, two opponents both scoreable by it.
    function mockScore(score: number): MatchupScore {
      return {
        score,
        move: "M",
        myHitsToKO: { min: 1, max: 1 },
        theirHitsToKoTaken: { min: 1, max: 1 },
        movesFirst: "attacker",
      };
    }
    const roster = [rosterMon(1, "A")];
    const opponents = [opponentMon(1, "X"), opponentMon(2, "Y")];
    const scoreMatrix: (MatchupScore | null)[][] = [[mockScore(5), mockScore(3)]];

    const result = assembleTeam(scoreMatrix, roster, opponents);

    expect(result.assignments).toHaveLength(1);
    // Y is the bottleneck (lower score, 3 < 5), so A is assigned to Y first.
    expect(result.assignments[0].opponent.species).toBe("Y");
    expect(result.uncoveredOpponents).toEqual([
      { species: "X", position: 1, reason: "roster too small to cover every opponent" },
    ]);
  });

  it("caps the assembled team at 6 even when more roster/opponent pairs are scoreable", () => {
    function mockScore(score: number): MatchupScore {
      return {
        score,
        move: "M",
        myHitsToKO: { min: 1, max: 1 },
        theirHitsToKoTaken: { min: 1, max: 1 },
        movesFirst: "attacker",
      };
    }

    const roster = [1, 2, 3, 4, 5, 6, 7].map((id) => rosterMon(id, `R${id}`));
    const opponents = [1, 2, 3, 4, 5, 6, 7].map((pos) => opponentMon(pos, `O${pos}`));

    // Fully connected: every roster Pokémon can score every opponent, all
    // with distinct scores so the bottleneck-first algorithm has a
    // well-defined assignment order and would happily assign all 7
    // without the cap.
    const scoreMatrix: (MatchupScore | null)[][] = roster.map((_, rosterIndex) =>
      opponents.map((_, opponentIndex) => mockScore(rosterIndex * 10 + opponentIndex))
    );

    const result = assembleTeam(scoreMatrix, roster, opponents);

    expect(result.assignments).toHaveLength(6);
    expect(result.uncoveredOpponents).toHaveLength(1);
    expect(result.uncoveredOpponents[0]).toEqual({
      species: "O7",
      position: 7,
      reason: "team is already at the 6-Pokémon cap",
    });
  });
});
