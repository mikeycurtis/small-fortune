import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { parseAmount, formatRate, formatMoney } from "./format.ts";
import {
  selectLines,
  wageContext,
  basketAgeMonths,
  STALE_AFTER_MONTHS,
} from "./basket-select.ts";
import type { Basket, BasketItem } from "./basket-types.ts";

/**
 * Covers the two pieces with real decision-making in them: tolerant amount
 * parsing (users paste all sorts of things) and basket line selection (the
 * feature itself). Run with `npm test`.
 */

describe("parseAmount", () => {
  const cases: Array<[string, number | null]> = [
    ["100", 100],
    ["1,200", 1200],
    ["1,200,000", 1_200_000],
    ["1.200.000", 1_200_000],
    ["12,5", 12.5],
    ["1,234.56", 1234.56],
    ["1.234,56", 1234.56],
    ["$1,999.99", 1999.99],
    ["₫ 45 000", 45000],
    ["0.5", 0.5],
    ["", null],
    ["abc", null],
  ];

  for (const [input, expected] of cases) {
    test(`${JSON.stringify(input)} → ${expected}`, () => {
      assert.equal(parseAmount(input), expected);
    });
  }
});

describe("formatRate", () => {
  test("keeps small rates legible", () => {
    // A naive 2-decimal format would render this as "0.00".
    assert.notEqual(formatRate(0.0000118), "0");
    assert.match(formatRate(0.0000118), /^0\.0000118/);
  });

  test("trims large rates", () => {
    assert.equal(formatRate(26278.143309), "26,278.14");
  });
});

/* ------------------------------------------------------------------ basket */

function item(
  id: string,
  price: number,
  category: BasketItem["category"],
): BasketItem {
  return { id, label: id, price, category, icon: "•", source: "local-survey" };
}

const basket: Basket = {
  countryCode: "VN",
  country: "Vietnam",
  city: "Hanoi",
  currency: "VND",
  updated: "2026-07",
  dailyWage: 350_000,
  items: [
    item("tea", 5_000, "drink"),
    item("beer", 15_000, "drink"),
    item("pho", 45_000, "food"),
    item("banh-mi", 25_000, "food"),
    item("bus", 8_000, "transport"),
    item("taxi", 60_000, "transport"),
    item("cinema", 90_000, "leisure"),
    item("hostel", 250_000, "housing"),
    item("rent", 6_000_000, "housing"),
  ],
};

describe("selectLines", () => {
  test("returns nothing for a zero or negative amount", () => {
    assert.deepEqual(selectLines(basket, 0), []);
    assert.deepEqual(selectLines(basket, -5), []);
  });

  test("spreads across categories rather than repeating one", () => {
    const lines = selectLines(basket, 500_000);
    const categories = new Set(lines.map((l) => l.item.category));
    assert.ok(
      categories.size >= 4,
      `expected a spread of categories, got ${[...categories].join(", ")}`,
    );
  });

  test("counts are affordable — never promises more than the money buys", () => {
    const amount = 500_000;
    for (const line of selectLines(basket, amount)) {
      if (!line.partial) {
        const claimed = Number(line.phrase.replace(/[^\d]/g, ""));
        assert.ok(
          claimed * line.item.price <= amount * 1.0001,
          `${line.item.id}: claimed ${claimed} but only ${amount / line.item.price} affordable`,
        );
      }
    }
  });

  test("falls back to fractions when nothing is affordable", () => {
    const lines = selectLines(basket, 3_000);
    assert.ok(lines.length > 0, "should still say something");
    assert.ok(
      lines.every((l) => l.partial),
      "every line should be a fraction",
    );
    assert.ok(lines.some((l) => /half|third|tenth|most|sliver/.test(l.phrase)));
  });

  test("respects the limit", () => {
    assert.ok(selectLines(basket, 10_000_000, 4).length <= 4);
  });
});

describe("wageContext", () => {
  test("stays silent for ordinary amounts", () => {
    assert.equal(wageContext(basket, 50_000), null);
  });

  test("speaks up when the amount matches a day's pay", () => {
    assert.match(wageContext(basket, 350_000) ?? "", /a day's pay in Vietnam/);
  });

  test("scales to weeks and months", () => {
    assert.match(wageContext(basket, 2_100_000) ?? "", /week's pay/);
    assert.match(wageContext(basket, 9_000_000) ?? "", /month's pay/);
  });

  test("stays silent when we have no wage figure", () => {
    const noWage: Basket = { ...basket };
    delete noWage.dailyWage;
    assert.equal(wageContext(noWage, 9_000_000), null);
  });
});

describe("formatMoney", () => {
  const vnd = {
    code: "VND", name: "Vietnamese Dong", symbol: "₫", decimals: 0,
    countryCode: "VN", country: "Vietnam", flag: "🇻🇳",
  };
  const kwd = {
    code: "KWD", name: "Kuwaiti Dinar", symbol: "د.ك", decimals: 3,
    countryCode: "KW", country: "Kuwait", flag: "🇰🇼",
  };

  test("groups for an English reader, keeps the local symbol", () => {
    // vi-VN would render "525.563 ₫", which reads as a decimal in English.
    assert.equal(formatMoney(525563, vnd), "₫525,563");
  });

  test("uses Western digits even for right-to-left currencies", () => {
    const out = formatMoney(6.2, kwd);
    // Asserted by property, not by literal: an RTL literal in source is a
    // minefield of invisible bidi marks.
    assert.ok(out.endsWith("6.200"), `expected Western digits, got ${out}`);
    assert.ok(!/[٠-٩]/.test(out), "must not use Arabic-Indic digits");
    assert.ok(out.startsWith(kwd.symbol), "should lead with the local symbol");
    assert.equal(kwd.decimals, 3, "KWD is a three-decimal currency");
  });

  test("keeps sub-unit amounts from collapsing to zero", () => {
    assert.notEqual(formatMoney(0.3, vnd), "₫0");
  });
});

describe("basketAgeMonths", () => {
  const at = (iso: string) => new Date(iso);

  test("is zero in the month it was checked", () => {
    assert.equal(basketAgeMonths("2026-07", at("2026-07-25T00:00:00Z")), 0);
  });

  test("counts whole months across a year boundary", () => {
    assert.equal(basketAgeMonths("2026-07", at("2027-01-01T00:00:00Z")), 6);
    assert.equal(basketAgeMonths("2025-12", at("2026-07-01T00:00:00Z")), 7);
  });

  test("never goes negative for a future stamp", () => {
    assert.equal(basketAgeMonths("2027-01", at("2026-07-01T00:00:00Z")), 0);
  });

  test("survives a malformed stamp rather than throwing", () => {
    assert.equal(basketAgeMonths("nonsense", at("2026-07-01T00:00:00Z")), 0);
  });

  test("crosses the staleness threshold when expected", () => {
    const justUnder = basketAgeMonths("2026-07", at("2027-03-01T00:00:00Z"));
    const justOver = basketAgeMonths("2026-07", at("2027-04-01T00:00:00Z"));
    assert.ok(justUnder < STALE_AFTER_MONTHS);
    assert.ok(justOver >= STALE_AFTER_MONTHS);
  });
});
