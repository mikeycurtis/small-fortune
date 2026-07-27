import type { Basket, BasketItem, ItemCategory } from "./basket-types";

/**
 * Pure basket-selection logic.
 *
 * Deliberately imports no data: the converter runs this on the client on every
 * keystroke, and pulling `data/baskets` in here would ship every country's
 * basket to the browser instead of the one being viewed.
 */

export type BasketLine = {
  item: BasketItem;
  /** Exact affordable count; may be fractional or very large. */
  quantity: number;
  /** Human phrasing of `quantity` — "13", "most of", "about half". */
  phrase: string;
  /** True when you cannot afford even one. */
  partial: boolean;
};

/**
 * Turns a raw multiple into something a person would say.
 *
 * The fractional band matters as much as the whole-number one: reversing a
 * conversion into an expensive country is the other half of the product, and
 * "0.62" is a worse answer than "most of".
 */
function phraseFor(quantity: number): { phrase: string; partial: boolean } {
  if (quantity >= 1) {
    const whole = Math.floor(quantity);
    if (whole >= 1_000_000) {
      return { phrase: `${Math.round(whole / 1_000_000)} million`, partial: false };
    }
    if (whole >= 10_000) {
      return { phrase: `${Math.round(whole / 1000)},000`, partial: false };
    }
    return { phrase: whole.toLocaleString("en-US"), partial: false };
  }

  if (quantity >= 0.85) return { phrase: "most of", partial: true };
  if (quantity >= 0.6) return { phrase: "three quarters of", partial: true };
  if (quantity >= 0.4) return { phrase: "about half", partial: true };
  if (quantity >= 0.22) return { phrase: "about a third of", partial: true };
  if (quantity >= 0.08) return { phrase: "a tenth of", partial: true };
  return { phrase: "barely a sliver of", partial: true };
}

/**
 * Picks the lines worth showing for `amount` (in the basket's currency).
 *
 * Preference order:
 *  1. Items you can afford at least one of, nearest to a satisfying count
 *     (2–40 reads better than 1 or 900,000).
 *  2. If you can afford nothing, the cheapest items — that emptiness IS the
 *     answer, and hiding it would break the reverse direction.
 * Categories are spread so the list reads as a day rather than a menu.
 */
export function selectLines(
  basket: Basket,
  amount: number,
  limit = 6,
): BasketLine[] {
  if (!Number.isFinite(amount) || amount <= 0) return [];

  const lines = basket.items.map((item) => {
    const quantity = amount / item.price;
    return { item, quantity, ...phraseFor(quantity) };
  });

  const affordable = lines.filter((l) => l.quantity >= 1);

  if (affordable.length === 0) {
    // Nothing is affordable: show the cheapest few, largest fraction first.
    return lines.sort((a, b) => b.quantity - a.quantity).slice(0, Math.min(3, limit));
  }

  // Rank by how "sayable" the count is. Counts in the low tens land best;
  // a million of anything is a number, not an image.
  const scored = affordable
    .map((line) => ({
      line,
      score: Math.abs(Math.log10(Math.max(line.quantity, 1)) - 1),
    }))
    .sort((a, b) => a.score - b.score);

  const picked: BalancedPick = { lines: [], seen: new Set() };
  for (const { line } of scored) {
    if (picked.lines.length >= limit) break;
    if (picked.seen.has(line.item.category)) continue;
    picked.lines.push(line);
    picked.seen.add(line.item.category);
  }
  for (const { line } of scored) {
    if (picked.lines.length >= limit) break;
    if (picked.lines.includes(line)) continue;
    picked.lines.push(line);
  }

  return picked.lines.sort((a, b) => b.item.price - a.item.price);
}

type BalancedPick = { lines: BasketLine[]; seen: Set<ItemCategory> };

/**
 * The one contextual line, shown only when the amount is genuinely striking
 * against local earnings. Returns null the rest of the time — used everywhere
 * it becomes wallpaper, and then a sermon.
 */
export function wageContext(basket: Basket, amount: number): string | null {
  if (!basket.dailyWage || amount <= 0) return null;

  const days = amount / basket.dailyWage;
  if (days >= 300) return `For context: that's around a year's pay in ${basket.country}.`;
  if (days >= 25) return `For context: that's around a month's pay in ${basket.country}.`;
  if (days >= 5) return `For context: that's about a week's pay in ${basket.country}.`;
  if (days >= 0.8) return `For context: that's about a day's pay in ${basket.country}.`;
  return null;
}

/**
 * Age of a basket in whole months, from its "YYYY-MM" stamp.
 *
 * Computed on the server and passed down, so the client never disagrees with
 * the rendered HTML about what "now" is.
 */
export function basketAgeMonths(updated: string, now = new Date()): number {
  const [year, month] = updated.split("-").map(Number);
  if (!year || !month) return 0;
  const months =
    (now.getUTCFullYear() - year) * 12 + (now.getUTCMonth() + 1 - month);
  return Math.max(0, months);
}

/** Past this, prices have had time to drift enough to say so out loud. */
export const STALE_AFTER_MONTHS = 9;
