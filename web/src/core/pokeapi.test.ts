import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getSpeciesInfo } from "./pokeapi";

describe("getSpeciesInfo", () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "pokeapi-cache-"));
  });

  afterEach(async () => {
    await fs.rm(cacheDir, { recursive: true, force: true });
  });

  it("fetches and caches species info on first call", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        types: [{ type: { name: "rock" } }, { type: { name: "ground" } }],
        abilities: [{ ability: { name: "sturdy" } }],
        sprites: { front_default: "https://example.com/geodude.png" },
      }),
    });

    const info = await getSpeciesInfo("Geodude", { cacheDir, fetchImpl });

    expect(info).toEqual({
      name: "Geodude",
      types: ["rock", "ground"],
      abilities: ["sturdy"],
      spriteUrl: "https://example.com/geodude.png",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const cacheFile = await fs.readFile(
      path.join(cacheDir, "geodude.json"),
      "utf-8"
    );
    expect(JSON.parse(cacheFile)).toEqual(info);
  });

  it("reads from cache on the second call instead of fetching again", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        types: [{ type: { name: "electric" } }],
        abilities: [{ ability: { name: "static" } }],
        sprites: { front_default: null },
      }),
    });

    await getSpeciesInfo("Pikachu", { cacheDir, fetchImpl });
    await getSpeciesInfo("Pikachu", { cacheDir, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns null and writes a negative-cache marker when the API call fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false });

    const info = await getSpeciesInfo("Missingno", { cacheDir, fetchImpl });

    expect(info).toBeNull();
    const cacheFile = await fs.readFile(
      path.join(cacheDir, "missingno.json"),
      "utf-8"
    );
    expect(JSON.parse(cacheFile)).toEqual({ __miss: true });
  });

  it("does not re-fetch a species that previously missed", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false });

    const first = await getSpeciesInfo("Missingno", { cacheDir, fetchImpl });
    const second = await getSpeciesInfo("Missingno", { cacheDir, fetchImpl });

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("normalizes 'Mr. Mime' to the PokeAPI slug 'mr-mime'", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        types: [{ type: { name: "psychic" } }, { type: { name: "fairy" } }],
        abilities: [{ ability: { name: "soundproof" } }],
        sprites: { front_default: "https://example.com/mr-mime.png" },
      }),
    });

    await getSpeciesInfo("Mr. Mime", { cacheDir, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain("/pokemon/mr-mime");
    expect(String(url)).not.toContain("mr.%20mime");
    expect(String(url)).not.toContain("%20");
  });

  it("normalizes \"Sirfetch'd\" to the PokeAPI slug 'sirfetchd'", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        types: [{ type: { name: "fighting" } }],
        abilities: [{ ability: { name: "steadfast" } }],
        sprites: { front_default: "https://example.com/sirfetchd.png" },
      }),
    });

    await getSpeciesInfo("Sirfetch'd", { cacheDir, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain("sirfetchd");
    expect(String(url)).not.toContain("'");
  });
});
