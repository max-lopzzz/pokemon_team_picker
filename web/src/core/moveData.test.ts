import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getMoveData } from "./moveData";

function mockPokeApiMoveResponse(data: {
  type: string;
  category: "physical" | "special" | "status";
  power: number | null;
  priority: number;
  critRate?: number;
}) {
  return {
    ok: true,
    json: async () => ({
      type: { name: data.type },
      damage_class: { name: data.category },
      power: data.power,
      priority: data.priority,
      meta: { crit_rate: data.critRate ?? 0 },
    }),
  };
}

describe("getMoveData", () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "movedata-cache-"));
  });

  afterEach(async () => {
    await fs.rm(cacheDir, { recursive: true, force: true });
  });

  it("fetches and maps a physical move's data", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockPokeApiMoveResponse({ type: "normal", category: "physical", power: 40, priority: 0 })
    );

    const result = await getMoveData("Tackle", { cacheDir, fetchImpl });

    expect(result).toEqual({
      name: "Tackle",
      type: "normal",
      category: "physical",
      power: 40,
      priority: 0,
      highCritRate: false,
    });
  });

  it("maps a status move's null power", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockPokeApiMoveResponse({ type: "normal", category: "status", power: null, priority: 0 })
    );

    const result = await getMoveData("Growl", { cacheDir, fetchImpl });

    expect(result).toEqual({
      name: "Growl",
      type: "normal",
      category: "status",
      power: null,
      priority: 0,
      highCritRate: false,
    });
  });

  it("maps a priority move's priority value", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockPokeApiMoveResponse({ type: "normal", category: "physical", power: 40, priority: 1 })
    );

    const result = await getMoveData("Quick Attack", { cacheDir, fetchImpl });

    expect(result!.priority).toBe(1);
  });

  it("marks a high-crit-rate move (e.g. Slash) as highCritRate: true", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockPokeApiMoveResponse({ type: "normal", category: "physical", power: 70, priority: 0, critRate: 1 })
    );

    const result = await getMoveData("Slash", { cacheDir, fetchImpl });

    expect(result!.highCritRate).toBe(true);
  });

  it("caches the result and does not refetch on a second call", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockPokeApiMoveResponse({ type: "normal", category: "physical", power: 40, priority: 0 })
    );

    await getMoveData("Tackle", { cacheDir, fetchImpl });
    await getMoveData("Tackle", { cacheDir, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("negative-caches a failed lookup so it does not refetch", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 });

    const first = await getMoveData("NotAMove", { cacheDir, fetchImpl });
    const second = await getMoveData("NotAMove", { cacheDir, fetchImpl });

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("strips punctuation from the move name when building the request URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockPokeApiMoveResponse({ type: "steel", category: "status", power: null, priority: 0 })
    );

    await getMoveData("King's Shield", { cacheDir, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const requestedUrl = fetchImpl.mock.calls[0][0] as string;
    expect(requestedUrl).toContain("kings-shield");
    expect(requestedUrl).not.toContain("king's-shield");
    expect(requestedUrl).not.toContain("king%27s-shield");
  });

  it("returns null when the response has an unrecognized damage class", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        type: { name: "normal" },
        damage_class: { name: "not-a-real-category" },
        power: 40,
        priority: 0,
      }),
    });

    const result = await getMoveData("Weird Move", { cacheDir, fetchImpl });

    expect(result).toBeNull();
  });
});
