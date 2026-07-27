/**
 * Shared basket types.
 *
 * These live apart from `lib/basket.ts` so the data modules under `data/` can
 * import the types without creating a cycle back through the selection logic.
 */

export type ItemCategory =
  | "food"
  | "drink"
  | "transport"
  | "housing"
  | "goods"
  | "leisure";

/**
 * Where a price came from. Recorded per item so the CC-BY-licensed rows can be
 * refreshed mechanically (and attributed correctly), while hand-checked local
 * rows are only ever touched by a human.
 */
export type PriceSource =
  | "local-survey"
  | "economist-bmi"
  | "wfp-hdx"
  | "operator-published";

export type BasketItem = {
  id: string;
  /** Named the way locals name it — "Bia Hơi", not "cheap local beer". */
  label: string;
  /** Short qualifier that makes the price legible: "at a street stall". */
  note?: string;
  /** Price in the basket's local currency, in major units. */
  price: number;
  category: ItemCategory;
  icon: string;
  source: PriceSource;
};

export type Basket = {
  countryCode: string;
  country: string;
  /** Prices are collected for one reference city, named in the UI. */
  city: string;
  currency: string;
  /** ISO year-month the prices were last checked. */
  updated: string;
  /**
   * Typical take-home pay for a day's median work, local currency. Powers the
   * one contextual line we show when a converted amount dwarfs it. Omitted
   * where we have no defensible figure — better absent than invented.
   */
  dailyWage?: number;
  /**
   * Set when the basket's *absolute* price levels were derived from verified
   * exchange-rate anchors plus domain knowledge, rather than from sourced local
   * prices. The relative ladder is still sound — a meal really does cost about
   * what this says relative to rent — but the overall scale is an estimate.
   *
   * This exists because a well-written basket reads identically whether its
   * numbers were researched or inferred, and that polish must not be allowed to
   * imply verification. Surfaced in the UI.
   */
  estimated?: boolean;
  items: BasketItem[];
};
