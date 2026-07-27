import "server-only";

/**
 * Exchange-rate access.
 *
 * Strategy: fetch a single USD-based table and derive every cross-rate by
 * division. One cached document covers the whole 165x165 pair matrix, and it
 * matches how the free tiers of most providers behave anyway (several pin the
 * base currency and only differ in which one).
 *
 * Primary:  open.er-api.com  — no key, 166 currencies, daily refresh.
 * Fallback: Fawaz Ahmed's currency-api on jsDelivr — no key, static CDN JSON.
 *
 * Both refresh once a day, so we revalidate hourly: staleness stays well inside
 * the upstream refresh window while upstream traffic stays near ~24 calls/day.
 */

const PRIMARY_URL = "https://open.er-api.com/v6/latest/USD";
const FALLBACK_URLS = [
  "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json",
  "https://latest.currency-api.pages.dev/v1/currencies/usd.min.json",
] as const;

const REVALIDATE_SECONDS = 3600;
const FETCH_TIMEOUT_MS = 6000;

export type RateSource = "exchangerate-api" | "currency-api";

export type RateTable = {
  /** Every rate is expressed per 1 USD. */
  base: "USD";
  rates: Readonly<Record<string, number>>;
  /** ISO timestamp of the upstream's last refresh. */
  updatedAt: string;
  source: RateSource;
};

export class RateFetchError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RateFetchError";
  }
}

type PrimaryResponse = {
  result?: string;
  "error-type"?: string;
  time_last_update_unix?: number;
  base_code?: string;
  rates?: Record<string, number>;
};

type FallbackResponse = {
  date?: string;
  usd?: Record<string, number>;
};

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    // Next 16 no longer caches fetch by default — without an explicit opt-in
    // every page view would hit the provider and earn us a 429.
    cache: "force-cache",
    next: { revalidate: REVALIDATE_SECONDS, tags: ["fx-rates"] },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new RateFetchError(`${url} responded ${response.status}`);
  }
  return response.json();
}

function normalizeCodes(raw: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [code, value] of Object.entries(raw)) {
    // Guard against nulls and non-finite values that occasionally appear for
    // thinly traded codes; a NaN rate would silently poison every conversion.
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      out[code.toUpperCase()] = value;
    }
  }
  return out;
}

async function fromPrimary(): Promise<RateTable> {
  const data = (await getJson(PRIMARY_URL)) as PrimaryResponse;

  if (data.result !== "success" || !data.rates) {
    throw new RateFetchError(
      `exchangerate-api returned ${data["error-type"] ?? "an unusable payload"}`,
    );
  }

  return {
    base: "USD",
    rates: normalizeCodes(data.rates),
    updatedAt: new Date((data.time_last_update_unix ?? 0) * 1000).toISOString(),
    source: "exchangerate-api",
  };
}

async function fromFallback(): Promise<RateTable> {
  let lastError: unknown;

  for (const url of FALLBACK_URLS) {
    try {
      const data = (await getJson(url)) as FallbackResponse;
      if (!data.usd) throw new RateFetchError(`${url} had no usd table`);

      return {
        base: "USD",
        rates: normalizeCodes(data.usd),
        // The CDN reports a date, not a timestamp; noon UTC is a fair midpoint.
        updatedAt: data.date
          ? new Date(`${data.date}T12:00:00Z`).toISOString()
          : new Date().toISOString(),
        source: "currency-api",
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw new RateFetchError("all fallback rate mirrors failed", {
    cause: lastError,
  });
}

/**
 * Returns a USD-based rate table, preferring the primary provider.
 * Throws `RateFetchError` only when every source is unreachable.
 */
export async function getRateTable(): Promise<RateTable> {
  try {
    return await fromPrimary();
  } catch (primaryError) {
    try {
      return await fromFallback();
    } catch (fallbackError) {
      throw new RateFetchError("could not reach any exchange-rate provider", {
        cause: { primaryError, fallbackError },
      });
    }
  }
}

/**
 * Cross-rate for `from`→`to`, derived through the USD base.
 * Returns null when either code is missing from the table, so callers can
 * distinguish "unsupported currency" from "rate happens to be zero".
 */
export function crossRate(
  table: RateTable,
  from: string,
  to: string,
): number | null {
  if (from === to) return 1;

  const fromRate = table.rates[from.toUpperCase()];
  const toRate = table.rates[to.toUpperCase()];
  if (!fromRate || !toRate) return null;

  return toRate / fromRate;
}

export function convert(
  table: RateTable,
  amount: number,
  from: string,
  to: string,
): number | null {
  const rate = crossRate(table, from, to);
  return rate === null ? null : amount * rate;
}
