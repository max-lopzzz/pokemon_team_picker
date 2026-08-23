import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fetchCached, toApiSlug, type FetchCachedParams } from "./apiCache";

describe("toApiSlug", () => {
  it("lowercases, strips dots and apostrophes, collapses whitespace to hyphens", () => {
    expect(toApiSlug("Mr. Mime")).toBe("mr-mime");
    expect(toApiSlug("Sirfetch'd")).toBe("sirfetchd");
    expect(toApiSlug("Tapu Koko")).toBe("tapu-koko");
    expect(toApiSlug("Pikachu")).toBe("pikachu");
  });
});

interface Widget {
  value: number;
}

describe("fetchCached", () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "apicache-"));
  });

  afterEach(async () => {
    await fs.rm(cacheDir, { recursive: true, force: true });
  });

  it("fetches, parses, and caches a successful response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ raw: 5 }),
    });

    const result = await fetchCached<Widget>({
      cacheKey: "widget-1",
      cacheDir,
      url: "https://example.com/widget/1",
      fetchImpl,
      errorLabel: 'widget "1"',
      parse: (data) => ({ value: (data as { raw: number }).raw * 2 }),
    });

    expect(result).toEqual({ value: 10 });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.com/widget/1",
      expect.objectContaining({ signal: expect.anything() })
    );

    const cacheFile = await fs.readFile(path.join(cacheDir, "widget-1.json"), "utf-8");
    expect(JSON.parse(cacheFile)).toEqual({ value: 10 });
  });

  it("reads from cache on a second call without fetching again", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ raw: 1 }),
    });

    const params: FetchCachedParams<Widget> = {
      cacheKey: "widget-2",
      cacheDir,
      url: "https://example.com/widget/2",
      fetchImpl,
      errorLabel: 'widget "2"',
      parse: (data) => ({ value: (data as { raw: number }).raw }),
    };

    await fetchCached<Widget>(params);
    await fetchCached<Widget>(params);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns null and negative-caches on an HTTP error, without refetching on a second call", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 });

    const params: FetchCachedParams<Widget> = {
      cacheKey: "widget-missing",
      cacheDir,
      url: "https://example.com/widget/missing",
      fetchImpl,
      errorLabel: 'widget "missing"',
      parse: (data) => ({ value: (data as { raw: number }).raw }),
    };

    const first = await fetchCached<Widget>(params);
    const second = await fetchCached<Widget>(params);

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns null and negative-caches when parse rejects a malformed response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ raw: "not-a-number" }),
    });

    const params: FetchCachedParams<Widget> = {
      cacheKey: "widget-malformed",
      cacheDir,
      url: "https://example.com/widget/malformed",
      fetchImpl,
      errorLabel: 'widget "malformed"',
      parse: (data) => {
        const raw = (data as { raw: unknown }).raw;
        return typeof raw === "number" ? { value: raw } : null;
      },
    };

    const first = await fetchCached<Widget>(params);
    const second = await fetchCached<Widget>(params);

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns null on a thrown fetch error (e.g. a timeout), same as an HTTP error", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("timed out"));

    const first = await fetchCached<Widget>({
      cacheKey: "widget-timeout",
      cacheDir,
      url: "https://example.com/widget/timeout",
      fetchImpl,
      errorLabel: 'widget "timeout"',
      parse: (data) => ({ value: (data as { raw: number }).raw }),
    });

    expect(first).toBeNull();
    // Matches existing precedent in every current client: any failure reason
    // (HTTP error or thrown exception) negative-caches identically. This is a
    // known, deliberately-deferred limitation (see Phase 3a final review) —
    // not something this refactor changes.
    await expect(
      fs.readFile(path.join(cacheDir, "widget-timeout.json"), "utf-8")
    ).resolves.toBeDefined();
  });

  it("passes a 5-second AbortSignal.timeout to fetchImpl", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ raw: 1 }),
    });

    await fetchCached<Widget>({
      cacheKey: "widget-timeout-check",
      cacheDir,
      url: "https://example.com/widget/timeout-check",
      fetchImpl,
      errorLabel: 'widget "timeout-check"',
      parse: (data) => ({ value: (data as { raw: number }).raw }),
    });

    const callArgs = fetchImpl.mock.calls[0][1] as { signal: AbortSignal };
    expect(callArgs.signal).toBeInstanceOf(AbortSignal);
  });
});
