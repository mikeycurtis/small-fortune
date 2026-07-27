import type { Basket } from "./basket-types";
import { BASKETS } from "@/data/baskets";

/**
 * Basket lookup — server-side only in practice, because importing this pulls
 * in every country's data. The pure scoring logic lives in `basket-select.ts`
 * so the client can run it against the single basket it was handed.
 */

export type {
  ItemCategory,
  BasketItem,
  Basket,
  PriceSource,
} from "./basket-types";
export type { BasketLine } from "./basket-select";

const BASKET_BY_COUNTRY = new Map(BASKETS.map((b) => [b.countryCode, b]));

const BASKET_BY_CURRENCY = new Map<string, Basket>();
for (const basket of BASKETS) {
  // A currency shared across countries (EUR, XOF) resolves to one reference
  // city — whichever sorts first — unless a countryCode disambiguates it.
  if (!BASKET_BY_CURRENCY.has(basket.currency)) {
    BASKET_BY_CURRENCY.set(basket.currency, basket);
  }
}

export function getBasket(
  currencyCode: string,
  countryCode?: string,
): Basket | undefined {
  if (countryCode) {
    const exact = BASKET_BY_COUNTRY.get(countryCode);
    if (exact && exact.currency === currencyCode) return exact;
  }
  return BASKET_BY_CURRENCY.get(currencyCode);
}

export function hasBasket(currencyCode: string): boolean {
  return BASKET_BY_CURRENCY.has(currencyCode);
}

/** Currency codes we can show a basket for — used to mark them in the picker. */
export const CURRENCIES_WITH_BASKETS: ReadonlySet<string> = new Set(
  BASKET_BY_CURRENCY.keys(),
);
