import type { Currency } from "./currencies";

/**
 * Number formatting for money.
 *
 * Two rules drive everything here:
 *  1. Minor units are per-currency (¥1 has no cents; ₫1 has no hào), so we take
 *     the digit count from the currency record rather than defaulting to 2.
 *  2. Very small and very large results both need to stay readable — 0.0000041
 *     and 254,000,000 are equally useless rendered naively.
 */

// Intl constructors are expensive enough that rebuilding one per render shows
// up in long result lists; they are immutable, so caching by key is safe.
const formatterCache = new Map<string, unknown>();

function formatter<T>(key: string, build: () => T): T {
  let cached = formatterCache.get(key);
  if (cached === undefined) {
    cached = build();
    formatterCache.set(key, cached);
  }
  return cached as T;
}

/**
 * Numbers are grouped the way this site's readers read — the page is in
 * English, and `vi-VN` rendering ₫525.563 flips the meaning of the separator
 * for that audience (worse, `ar-KW` renders digits as ٦٫٢٠٠). The *symbol*
 * still comes from the currency itself, so the money stays local even though
 * the punctuation doesn't.
 */
const SITE_LOCALE = "en-US";

function groupedNumber(amount: number, digits: number): string {
  return formatter(`num:${digits}`, () =>
    new Intl.NumberFormat(SITE_LOCALE, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }),
  ).format(amount);
}

function digitsFor(amount: number, currency: Currency): number {
  // Amounts below the currency's smallest unit would render as a bare zero,
  // which reads as "nothing" rather than "very little". Show more precision.
  const belowMinorUnit =
    amount !== 0 && Math.abs(amount) < 10 ** -currency.decimals;
  return belowMinorUnit
    ? Math.min(8, currency.decimals + 4)
    : currency.decimals;
}

/** Full currency rendering with the native symbol, e.g. "₫525,563". */
export function formatMoney(amount: number, currency: Currency): string {
  const number = groupedNumber(amount, digitsFor(amount, currency));
  // Single-glyph symbols sit flush; wordier ones ("zł", "د.ك") need air.
  const separator = [...currency.symbol].length === 1 ? "" : " ";
  return `${currency.symbol}${separator}${number}`;
}

/** Bare grouped number, no symbol — for use beside an explicit code. */
export function formatAmount(amount: number, currency: Currency): string {
  return groupedNumber(amount, digitsFor(amount, currency));
}

/**
 * The headline rate line. Rates span ~9 orders of magnitude across real pairs
 * (KWD→VND is ~85,000; VND→KWD is ~0.0000118), so significant digits beat a
 * fixed decimal count.
 */
export function formatRate(rate: number): string {
  const abs = Math.abs(rate);

  // At or above 1 the integer part carries the meaning, so cap decimals.
  if (abs >= 1) {
    const digits = abs >= 1000 ? 2 : abs >= 100 ? 3 : 4;
    return formatter(`rate:fixed${digits}`, () =>
      new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: digits,
      }),
    ).format(rate);
  }

  // Below 1 the leading zeros carry no information — count significant digits
  // instead, so VND→KWD shows 0.0000118 rather than 0.00.
  return formatter("rate:sig", () =>
    new Intl.NumberFormat("en-US", { maximumSignificantDigits: 4 }),
  ).format(rate);
}

/** "3 minutes ago" / "yesterday", for the rate freshness stamp. */
export function formatRelativeTime(iso: string, now = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "recently";

  const seconds = Math.round((then - now) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["second", 60],
    ["minute", 60],
    ["hour", 24],
    ["day", 30],
    ["month", 12],
    ["year", Number.POSITIVE_INFINITY],
  ];

  let value = seconds;
  for (const [unit, step] of units) {
    if (Math.abs(value) < step) {
      return formatter(`rel:${unit}`, () =>
        new Intl.RelativeTimeFormat("en-US", { numeric: "auto" }),
      ).format(Math.round(value), unit);
    }
    value /= step;
  }
  return "recently";
}

/** Parses user input tolerantly: strips grouping, symbols, and stray spaces. */
export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[^\d.,-]/g, "").trim();
  if (!cleaned) return null;

  // If both separators appear, the rightmost one is the decimal point.
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized: string;

  const commas = cleaned.split(",").length - 1;
  const dots = cleaned.split(".").length - 1;

  if (lastComma > -1 && lastDot > -1) {
    // Both present: the rightmost separator is the decimal point,
    // the other is grouping. "1.234,56" (EU) vs "1,234.56" (US).
    normalized =
      lastComma > lastDot
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else if (commas > 1 || dots > 1) {
    // Repeated separators can only be grouping: "1,200,000" / "1.200.000".
    normalized = cleaned.replace(/[.,]/g, "");
  } else if (lastComma > -1) {
    // A single comma with exactly three trailing digits is grouping
    // ("1,200"); anything else is a decimal comma ("12,5").
    const tail = cleaned.slice(lastComma + 1);
    normalized =
      tail.length === 3 ? cleaned.replace(",", "") : cleaned.replace(",", ".");
  } else {
    normalized = cleaned;
  }

  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}
