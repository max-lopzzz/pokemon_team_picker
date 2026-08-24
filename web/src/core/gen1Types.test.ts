import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getGen1Types } from "./gen1Types";

describe("getGen1Types", () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "gen1types-cache-"));
  });

  afterEach(async () => {
    await fs.rm(cacheDir, { recursive: true, force: true });
  });

  it("selects the earliest past_types entry as the Gen 1 typing (Clefairy-style Fairy retcon)", async () => {
    // Real PokeAPI shape: Clefairy's Fairy type was added in Gen VI, so its
    // pre-Fairy typing (Normal) is recorded under generation-v (the last
    // generation it held), NOT generation-i.
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        types: [{ type: { name: "fairy" } }],
        past_types: [
          {
            generation: { name: "generation-v" },
            types: [{ type: { name: "normal" } }],
          },
        ],
      }),
    });

    const result = await getGen1Types("Clefairy", { cacheDir, fetchImpl });

    expect(result).toEqual(["normal"]);
  });

  it("selects the chronologically earliest entry when multiple past_types entries exist, regardless of array order", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        types: [{ type: { name: "water" } }, { type: { name: "ice" } }],
        past_types: [
          {
            generation: { name: "generation-iv" },
            types: [{ type: { name: "water" } }],
          },
          {
            generation: { name: "generation-i" },
            types: [{ type: { name: "normal" } }],
          },
        ],
      }),
    });

    const result = await getGen1Types("TestMon", { cacheDir, fetchImpl });

    expect(result).toEqual(["normal"]);
  });

  it("falls back to current types when past_types is absent entirely", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        types: [{ type: { name: "grass" } }, { type: { name: "poison" } }],
      }),
    });

    const result = await getGen1Types("Bulbasaur", { cacheDir, fetchImpl });

    expect(result).toEqual(["grass", "poison"]);
  });

  it("falls back to current types when past_types is an empty array", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        types: [{ type: { name: "fire" } }],
        past_types: [],
      }),
    });

    const result = await getGen1Types("Growlithe", { cacheDir, fetchImpl });

    expect(result).toEqual(["fire"]);
  });

  it("returns null when the resolved typing includes a type that didn't exist in Gen 1", async () => {
    // A species that debuted after Gen 1 with a post-Gen-1 type (e.g.
    // Dark) has no past_types entry (it never changed type) and its
    // current type is not Gen-1-valid.
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        types: [{ type: { name: "dark" } }, { type: { name: "ghost" } }],
      }),
    });

    const result = await getGen1Types("Sableye", { cacheDir, fetchImpl });

    expect(result).toBeNull();
  });

  it("caches the result and does not refetch on a second call", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ types: [{ type: { name: "normal" } }] }),
    });

    await getGen1Types("Rattata", { cacheDir, fetchImpl });
    await getGen1Types("Rattata", { cacheDir, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("negative-caches a failed lookup so it does not refetch", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 });

    const first = await getGen1Types("Missingno", { cacheDir, fetchImpl });
    const second = await getGen1Types("Missingno", { cacheDir, fetchImpl });

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
