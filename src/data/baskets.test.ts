import assert from "node:assert/strict";
import { test, describe } from "node:test";
// Imported per region rather than through `baskets.ts`: the aggregator uses
// extensionless specifiers for the bundler, which Node's ESM loader rejects.
import { APAC_BASKETS } from "./baskets/apac.ts";
import { EUAM_BASKETS } from "./baskets/euam.ts";
import { AMEA_BASKETS } from "./baskets/amea.ts";
import { SASIA_BASKETS } from "./baskets/sasia.ts";
import { EUROPE2_BASKETS } from "./baskets/europe2.ts";
import { MIDEAST_BASKETS } from "./baskets/mideast.ts";
import { CASIA_BASKETS } from "./baskets/casia.ts";
import { AFRICA2_BASKETS } from "./baskets/africa2.ts";
import { SAFRICA_BASKETS } from "./baskets/safrica.ts";
import { WAFRICA_BASKETS } from "./baskets/wafrica.ts";
import { PACIFIC_BASKETS } from "./baskets/pacific.ts";
import { CARIBBEAN_BASKETS } from "./baskets/caribbean.ts";
import { LATAM_BASKETS } from "./baskets/latam.ts";
import { CURRENCY_BY_CODE } from "../lib/currencies.ts";
import { selectLines } from "../lib/basket-select.ts";
import type { ItemCategory } from "../lib/basket-types.ts";

const BASKETS = [
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
];

/**
 * Structural validation of the curated data. These are the invariants the UI
 * silently depends on — a basket that violates any of them produces a page
 * that renders but reads wrong, which is the worst failure mode here.
 */

const CATEGORIES: ItemCategory[] = [
  "food",
  "drink",
  "transport",
  "housing",
  "goods",
  "leisure",
];

test("we have a meaningful number of countries", () => {
  assert.ok(BASKETS.length >= 30, `only ${BASKETS.length} baskets`);
});

describe("every basket", () => {
  for (const basket of BASKETS) {
    describe(`${basket.country} (${basket.currency})`, () => {
      test("uses a currency and country we actually know", () => {
        const currency = CURRENCY_BY_CODE.get(basket.currency);
        assert.ok(currency, `unknown currency ${basket.currency}`);
        assert.match(
          basket.countryCode,
          /^[A-Z]{2}$/,
          "countryCode should be ISO 3166-1 alpha-2",
        );

        // A shared currency (EUR → "EU") has no single issuing country, so the
        // basket picks a reference one — Berlin for the euro. Only demand a
        // match where the currency really does belong to one country.
        const isSupranational = !CURRENCY_BY_CODE.has(basket.currency)
          ? false
          : currency.country === "European Union";
        if (!isSupranational) {
          assert.equal(
            currency.countryCode,
            basket.countryCode,
            `${basket.currency} maps to ${currency.countryCode}, basket says ${basket.countryCode}`,
          );
        }
      });

      test("has enough items to choose from", () => {
        assert.ok(
          basket.items.length >= 14,
          `${basket.items.length} items is too few for good selection`,
        );
      });

      test("has unique item ids", () => {
        const ids = basket.items.map((i) => i.id);
        assert.equal(new Set(ids).size, ids.length, "duplicate item id");
      });

      test("covers at least five of the six categories", () => {
        const present = new Set(basket.items.map((i) => i.category));
        for (const category of present) {
          assert.ok(
            CATEGORIES.includes(category),
            `unknown category ${category}`,
          );
        }
        assert.ok(
          present.size >= 5,
          `only covers ${[...present].join(", ")}`,
        );
      });

      test("prices are positive and finite", () => {
        for (const item of basket.items) {
          assert.ok(
            Number.isFinite(item.price) && item.price > 0,
            `${item.id} has price ${item.price}`,
          );
        }
      });

      test("spans a wide enough price ladder", () => {
        const prices = basket.items.map((i) => i.price);
        const ratio = Math.max(...prices) / Math.min(...prices);
        // The selector needs range to say something sensible at both $2 and
        // $2,000. Under ~50x it runs out of things to show at one end.
        assert.ok(ratio >= 50, `price ladder only spans ${Math.round(ratio)}x`);
      });

      test("every item has a label, icon and source", () => {
        for (const item of basket.items) {
          assert.ok(item.label.trim().length > 2, `${item.id}: thin label`);
          assert.ok(item.icon.trim().length > 0, `${item.id}: no icon`);
          assert.ok(item.source, `${item.id}: no source recorded`);
        }
      });

      test("avoids the tonal words we banned", () => {
        // The product's main failure mode is tonal, so it is worth a test.
        const banned = /\b(cheap|bargain|steal|exotic|dirt.?cheap)\b/i;
        for (const item of basket.items) {
          const text = `${item.label} ${item.note ?? ""}`;
          assert.ok(!banned.test(text), `${item.id}: "${text.trim()}"`);
          assert.ok(!text.includes("!"), `${item.id}: exclamation mark`);
        }
      });

      test("the estimated flag, if set, is only ever true", () => {
        // A `false` here would read as "verified", which is a claim we do not
        // make. Absence is the verified state; presence is the caveat.
        if ("estimated" in basket) {
          assert.equal(basket.estimated, true, "estimated must be true or absent");
        }
      });

      test("dailyWage, if present, is plausible against the basket", () => {
        if (basket.dailyWage === undefined) return;
        const prices = basket.items.map((i) => i.price).sort((a, b) => a - b);
        const cheapest = prices[0]!;
        const dearest = prices[prices.length - 1]!;
        // A day's pay should buy many of the cheapest item but not the
        // dearest (which is typically a month's rent).
        assert.ok(
          basket.dailyWage > cheapest * 3,
          `daily wage ${basket.dailyWage} barely buys the cheapest item (${cheapest})`,
        );
        assert.ok(
          basket.dailyWage < dearest,
          `daily wage ${basket.dailyWage} exceeds the dearest item (${dearest})`,
        );
      });

      test("produces sensible lines across a wide range of amounts", () => {
        const median =
          basket.items.map((i) => i.price).sort((a, b) => a - b)[
            Math.floor(basket.items.length / 2)
          ] ?? 1;

        for (const multiplier of [0.05, 1, 20, 500]) {
          const lines = selectLines(basket, median * multiplier);
          assert.ok(
            lines.length > 0,
            `no lines at ${multiplier}x the median price`,
          );
          for (const line of lines) {
            assert.ok(
              Number.isFinite(line.quantity),
              `${line.item.id}: non-finite quantity`,
            );
            assert.ok(line.phrase.length > 0, `${line.item.id}: empty phrase`);
          }
        }
      });
    });
  }
});
