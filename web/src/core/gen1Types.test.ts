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

  it("returns the generation-i past_types entry when present", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        types: [{ type: { name: "fairy" } }],
        past_types: [
          {
            generation: { name: "generation-i" },
            types: [{ type: { name: "normal" } }],
          },
        ],
      }),
    });

    const result = await getGen1Types("Clefairy", { cacheDir, fetchImpl });

    expect(result).toEqual(["normal"]);
  });

  it("falls back to current types when past_types has no generation-i entry", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        types: [{ type: { name: "water" } }],
        past_types: [
          {
            generation: { name: "generation-vi" },
            types: [{ type: { name: "water" } }],
          },
        ],
      }),
    });

    const result = await getGen1Types("Politoed", { cacheDir, fetchImpl });

    expect(result).toEqual(["water"]);
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
