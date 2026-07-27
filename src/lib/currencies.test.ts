import assert from "node:assert/strict";
import { test, describe } from "node:test";
import {
  CURRENCIES,
  CURRENCY_BY_CODE,
  getCurrency,
  POPULAR_CODES,
} from "./currencies.ts";

/**
 * The currency list is machine-generated against the rate provider's live set,
 * so these guard the properties the generator could silently get wrong.
 */

test("covers the provider's full fiat list", () => {
  assert.ok(
    CURRENCIES.length >= 150,
    `only ${CURRENCIES.length} currencies — expected the full provider list`,
  );
});

test("codes are unique and sorted", () => {
  const codes = CURRENCIES.map((c) => c.code);
  assert.equal(new Set(codes).size, codes.length, "duplicate currency code");
  assert.deepEqual(codes, [...codes].sort(), "not sorted by code");
});

test("omits pure accounting units", () => {
  // Quoted by the provider, but not money anyone can spend.
  for (const code of ["XDR", "CLF", "XXX", "XTS"]) {
    assert.equal(getCurrency(code), undefined, `${code} should be excluded`);
  }
});

test("omits retired and superseded currencies", () => {
  // The provider still quotes these, which makes them look alive. Converting
  // into a currency that no longer circulates says nothing about what money
  // buys there today.
  const retired = {
    HRK: "Croatia adopted the euro in 2023",
    BGN: "Bulgaria adopted the euro 2026-01-01; lev retired 2026-02-01",
    ANG: "ceased legal tender 2025-07-01, superseded by XCG",
    SLL: "redenominated to SLE in 2022",
    ZWL: "replaced by ZWG in 2024",
    CNH: "offshore renminbi, the same currency as CNY",
  };
  for (const [code, why] of Object.entries(retired)) {
    assert.equal(getCurrency(code), undefined, `${code} should be gone — ${why}`);
  }
  // The live successors must still be present.
  for (const code of ["EUR", "XCG", "SLE", "ZWG", "CNY"]) {
    assert.ok(getCurrency(code), `${code} is the live successor and must exist`);
  }
});

test("no country is listed with two currencies", () => {
  const byCountry = new Map<string, string[]>();
  for (const c of CURRENCIES) {
    byCountry.set(c.country, [...(byCountry.get(c.country) ?? []), c.code]);
  }
  const dupes = [...byCountry].filter(([, codes]) => codes.length > 1);
  assert.deepEqual(
    dupes,
    [],
    `a country with two live currencies usually means a retired code survived: ${dupes
      .map(([k, v]) => `${k} (${v.join(", ")})`)
      .join("; ")}`,
  );
});

test("getCurrency is case-insensitive", () => {
  assert.equal(getCurrency("usd")?.code, "USD");
  assert.equal(getCurrency("UsD")?.code, "USD");
  assert.equal(getCurrency("nope"), undefined);
});

test("popular codes all resolve", () => {
  assert.ok(POPULAR_CODES.length >= 10);
  for (const code of POPULAR_CODES) {
    assert.ok(CURRENCY_BY_CODE.has(code), `${code} is popular but missing`);
  }
});

describe("every currency", () => {
  for (const currency of CURRENCIES) {
    test(`${currency.code} is well-formed`, () => {
      assert.match(currency.code, /^[A-Z]{3}$/);
      assert.match(currency.countryCode, /^[A-Z]{2}$/);
      assert.ok(currency.name.trim().length > 2, "thin name");
      assert.ok(currency.country.trim().length > 1, "thin country");
      assert.ok(currency.symbol.trim().length > 0, "no symbol");

      // Real minor units run 0–3; anything else means a bad Intl lookup.
      assert.ok(
        Number.isInteger(currency.decimals) &&
          currency.decimals >= 0 &&
          currency.decimals <= 3,
        `decimals ${currency.decimals}`,
      );

      // A flag emoji is exactly two regional-indicator codepoints, and they
      // must spell the country code — a mismatch shows the wrong flag.
      const points = [...currency.flag].map((ch) => ch.codePointAt(0)!);
      assert.equal(points.length, 2, "flag should be 2 codepoints");
      const spelled = points
        .map((p) => String.fromCharCode(p - 0x1f1e6 + 65))
        .join("");
      assert.equal(
        spelled,
        currency.countryCode,
        `flag spells ${spelled}, countryCode is ${currency.countryCode}`,
      );
    });
  }
});

describe("shared-currency aliases", () => {
  test("the euro is findable by member state", () => {
    const eur = getCurrency("EUR");
    assert.ok(eur?.aliases?.includes("Spain"));
    assert.ok(eur?.aliases?.includes("Germany"));
    // Newly adopted — searching the country must still reach a live currency.
    assert.ok(eur?.aliases?.includes("Croatia"));
    assert.ok(eur?.aliases?.includes("Bulgaria"));
  });

  test("the CFA francs are findable by member state", () => {
    assert.ok(getCurrency("XOF")?.aliases?.includes("Senegal"));
    assert.ok(getCurrency("XOF")?.aliases?.includes("Ivory Coast"));
    assert.ok(getCurrency("XAF")?.aliases?.includes("Gabon"));
  });

  test("dollarised economies point at the dollar", () => {
    assert.ok(getCurrency("USD")?.aliases?.includes("Panama"));
  });

  test("no alias list is empty", () => {
    for (const currency of CURRENCIES) {
      if (currency.aliases) {
        assert.ok(currency.aliases.length > 0, `${currency.code}: empty aliases`);
      }
    }
  });
});
