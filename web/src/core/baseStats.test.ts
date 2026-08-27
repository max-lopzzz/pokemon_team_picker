import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getBaseStats } from "./baseStats";

function mockPokeApiResponse(stats: Record<string, number>) {
  return {
    ok: true,
    json: async () => ({
      stats: Object.entries(stats).map(([name, base_stat]) => ({
        base_stat,
        stat: { name },
      })),
    }),
  };
}

describe("getBaseStats", () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "basestats-cache-"));
  });

  afterEach(async () => {
    await fs.rm(cacheDir, { recursive: true, force: true });
  });

  it("fetches and maps PokeAPI stat names to StatBlock keys", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockPokeApiResponse({
        hp: 45,
        attack: 49,
        defense: 49,
        "special-attack": 65,
        "special-defense": 65,
        speed: 45,
      })
    );

    const result = await getBaseStats("Bulbasaur", { cacheDir, fetchImpl });

    expect(result).toEqual({ hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 });
  });

  it("normalizes multi-word species via toApiSlug before requesting", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockPokeApiResponse({
        hp: 20,
        attack: 20,
        defense: 20,
        "special-attack": 20,
        "special-defense": 20,
        speed: 20,
      })
    );

    await getBaseStats("Mr. Mime", { cacheDir, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("mr-mime"),
      expect.anything()
    );
  });

  it("caches the result and does not refetch on a second call", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockPokeApiResponse({
        hp: 45,
        attack: 49,
        defense: 49,
        "special-attack": 65,
        "special-defense": 65,
        speed: 45,
      })
    );

    await getBaseStats("Bulbasaur", { cacheDir, fetchImpl });
    await getBaseStats("Bulbasaur", { cacheDir, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("negative-caches a failed lookup so it does not refetch", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 });

    const first = await getBaseStats("Missingno", { cacheDir, fetchImpl });
    const second = await getBaseStats("Missingno", { cacheDir, fetchImpl });

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
