import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getLearnableMoves } from "./movelearn";

function mockPokeApiResponse(
  moves: { name: string; versionGroup: string; method: string }[]
) {
  return {
    ok: true,
    json: async () => ({
      moves: moves.map((m) => ({
        move: { name: m.name },
        version_group_details: [
          {
            version_group: { name: m.versionGroup },
            move_learn_method: { name: m.method },
          },
        ],
      })),
    }),
  };
}

describe("getLearnableMoves", () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "movelearn-cache-"));
  });

  afterEach(async () => {
    await fs.rm(cacheDir, { recursive: true, force: true });
  });

  it("groups moves by learn method for the game's version group", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockPokeApiResponse([
        { name: "tackle", versionGroup: "red-blue", method: "level-up" },
        { name: "defense-curl", versionGroup: "red-blue", method: "level-up" },
        { name: "rock-slide", versionGroup: "red-blue", method: "machine" },
        { name: "sand-tomb", versionGroup: "red-blue", method: "tutor" },
        { name: "ancient-power", versionGroup: "red-blue", method: "egg" },
        { name: "future-sight", versionGroup: "gold-silver", method: "machine" },
      ])
    );

    const result = await getLearnableMoves("Geodude", "Red", { cacheDir, fetchImpl });

    expect(result).toEqual({
      levelUp: ["tackle", "defense-curl"],
      machine: ["rock-slide"],
      tutor: ["sand-tomb"],
      egg: ["ancient-power"],
    });
  });

  it("returns null for a game with no version-group mapping, without fetching", async () => {
    const fetchImpl = vi.fn();
    const result = await getLearnableMoves("Geodude", "NotAGame", {
      cacheDir,
      fetchImpl,
    });
    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("caches the result and does not refetch on a second call", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockPokeApiResponse([{ name: "tackle", versionGroup: "red-blue", method: "level-up" }])
    );

    await getLearnableMoves("Geodude", "Red", { cacheDir, fetchImpl });
    await getLearnableMoves("Geodude", "Red", { cacheDir, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("normalizes multi-word species names to PokeAPI's hyphenated slug", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockPokeApiResponse([
        { name: "thunderbolt", versionGroup: "sun-moon", method: "level-up" },
      ])
    );

    await getLearnableMoves("Tapu Koko", "Sun", { cacheDir, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const requestedUrl = fetchImpl.mock.calls[0][0] as string;
    expect(requestedUrl).toContain("tapu-koko");
    expect(requestedUrl).not.toContain("tapu%20koko");
    expect(requestedUrl).not.toContain("tapu koko");
  });

  it("negative-caches a failed lookup so it does not refetch", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 });

    const first = await getLearnableMoves("Missingno", "Red", { cacheDir, fetchImpl });
    const second = await getLearnableMoves("Missingno", "Red", { cacheDir, fetchImpl });

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
