import fs from "node:fs/promises";
import path from "node:path";

/**
 * Normalizes a name into PokeAPI's slug format: lowercase, dots and
 * apostrophes stripped, whitespace collapsed to hyphens. E.g. "Mr. Mime" ->
 * "mr-mime", "Sirfetch'd" -> "sirfetchd".
 */
export function toApiSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.']/g, "")
    .replace(/\s+/g, "-");
}

/** A sentinel cache entry written when a lookup fails, so we don't re-hit
 * the network on every subsequent call for a permanently-missing or
 * malformed-response case. */
interface CacheMiss {
  __miss: true;
}

type CacheEntry<T> = T | CacheMiss;

function isCacheMiss<T>(entry: CacheEntry<T>): entry is CacheMiss {
  return (entry as CacheMiss).__miss === true;
}

export interface FetchCachedParams<T> {
  cacheKey: string;
  cacheDir: string;
  url: string;
  fetchImpl: typeof fetch;
  /** Maps the raw JSON response to T, or returns null if it's malformed /
   * doesn't contain what was expected — a null here is treated the same as
   * an HTTP error: logged and negative-cached. */
  parse: (data: unknown) => T | null;
  /** Used in log messages, e.g. `species "Pikachu"` or `move "Tackle"`. */
  errorLabel: string;
}

/**
 * Shared fetch-with-cache pipeline for PokeAPI-backed lookups: reads a
 * disk cache first, falls back to a network fetch (5s timeout) with a
 * caller-supplied parser, and negative-caches any failure (HTTP error,
 * malformed response, or thrown exception) so it isn't retried on every
 * call. The parser is the only endpoint-specific logic callers provide.
 */
export async function fetchCached<T>(params: FetchCachedParams<T>): Promise<T | null> {
  const { cacheKey, cacheDir, url, fetchImpl, parse, errorLabel } = params;

  const cached = await readCache<T>(cacheKey, cacheDir);
  if (cached !== null) {
    return isCacheMiss(cached) ? null : cached;
  }

  const fetched = await fetchAndParse(url, fetchImpl, parse, errorLabel);
  try {
    await writeCache<T>(cacheKey, cacheDir, fetched ?? { __miss: true });
  } catch (err) {
    console.error(`Failed to write cache for "${cacheKey}":`, err);
  }
  return fetched;
}

function cacheFilePath(cacheKey: string, cacheDir: string): string {
  return path.join(cacheDir, `${cacheKey}.json`);
}

async function readCache<T>(
  cacheKey: string,
  cacheDir: string
): Promise<CacheEntry<T> | null> {
  try {
    const raw = await fs.readFile(cacheFilePath(cacheKey, cacheDir), "utf-8");
    return JSON.parse(raw) as CacheEntry<T>;
  } catch {
    return null;
  }
}

async function writeCache<T>(
  cacheKey: string,
  cacheDir: string,
  entry: CacheEntry<T>
): Promise<void> {
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(cacheFilePath(cacheKey, cacheDir), JSON.stringify(entry), "utf-8");
}

async function fetchAndParse<T>(
  url: string,
  fetchImpl: typeof fetch,
  parse: (data: unknown) => T | null,
  errorLabel: string
): Promise<T | null> {
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      console.error(`PokeAPI request failed for ${errorLabel}: HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const parsed = parse(data);
    if (parsed === null) {
      console.error(`PokeAPI response for ${errorLabel} was malformed or unexpected`);
    }
    return parsed;
  } catch (err) {
    console.error(`PokeAPI request failed for ${errorLabel}:`, err);
    return null;
  }
}
