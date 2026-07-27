import type { Basket } from "../lib/basket-types";
import { APAC_BASKETS } from "./baskets/apac";
import { EUAM_BASKETS } from "./baskets/euam";
import { AMEA_BASKETS } from "./baskets/amea";
import { SASIA_BASKETS } from "./baskets/sasia";
import { EUROPE2_BASKETS } from "./baskets/europe2";
import { MIDEAST_BASKETS } from "./baskets/mideast";
import { CASIA_BASKETS } from "./baskets/casia";
import { AFRICA2_BASKETS } from "./baskets/africa2";
import { SAFRICA_BASKETS } from "./baskets/safrica";
import { WAFRICA_BASKETS } from "./baskets/wafrica";
import { PACIFIC_BASKETS } from "./baskets/pacific";
import { CARIBBEAN_BASKETS } from "./baskets/caribbean";
import { LATAM_BASKETS } from "./baskets/latam";

/**
 * Curated local-price baskets — the data behind "what it actually buys".
 *
 * WHY THIS IS CURATED AND NOT AN API
 * ----------------------------------
 * Every cost-of-living API sells the same generic basket in every country
 * ("Meal, Inexpensive Restaurant"; "Cheese, imported, 1kg") because
 * cross-country comparability is the point of their schema. That is precisely
 * the property this product has to throw away: the feature works because the
 * items are specifically Vietnamese, or specifically Norwegian. Imported cheese
 * is noise in Hanoi. So the basket is hand-built.
 *
 * Numbeo is deliberately not used at any tier. Its terms prohibit automated
 * collection outright, its free tier does not cover a public site, and even a
 * paid licence forbids redistributing the data through a public feed. The
 * widely-mirrored Kaggle "global cost of living" datasets are Numbeo scrapes
 * relabelled CC0 by uploaders who had no standing to relicense them — the
 * badge is not clearance, and they are years stale besides.
 *
 * SOURCING
 * --------
 * Each item records a `source`:
 *   local-survey        hand-checked against menus, listings and reporting
 *   economist-bmi       The Economist's Big Mac Index (data CC BY 4.0)
 *   wfp-hdx             WFP food prices via HDX (CC BY 3.0 IGO)
 *   operator-published  published fares and ticket prices from the operator
 *
 * Per-item provenance is what makes refreshes tractable: the CC-BY rows can be
 * updated mechanically from their feeds, and only the local rows need a human.
 *
 * REFRESH
 * -------
 * Prices are indicative and drift. Target a refresh twice a year, and sooner
 * for high-inflation currencies (ARS, TRY, EGP, NGN, GHS), which can move far
 * enough in months to make a line read as wrong. `updated` is surfaced in the
 * UI so the age of the data is never hidden from the reader.
 */

export const BASKETS: readonly Basket[] = [
  ...APAC_BASKETS,
  ...EUAM_BASKETS,
  ...AMEA_BASKETS,
  ...SASIA_BASKETS,
  ...EUROPE2_BASKETS,
  ...MIDEAST_BASKETS,
  ...CASIA_BASKETS,
  ...AFRICA2_BASKETS,
  ...SAFRICA_BASKETS,
  ...WAFRICA_BASKETS,
  ...PACIFIC_BASKETS,
  ...CARIBBEAN_BASKETS,
  ...LATAM_BASKETS,
].sort((a, b) => a.country.localeCompare(b.country));
