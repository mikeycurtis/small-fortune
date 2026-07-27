/**
 * Regenerates src/lib/currencies.ts to cover every currency the rate provider
 * returns. Existing hand-curated rows win; the rest are derived from Intl.
 */
import { writeFileSync } from "node:fs";
import { CURRENCIES } from "../src/lib/currencies.ts";

const OUT = new URL("../src/lib/currencies.ts", import.meta.url);

/**
 * Codes the provider quotes that we deliberately do not offer.
 *
 * Two kinds. First, accounting units — real quotes, but not money anyone spends,
 * so offering them as a destination is nonsense. Second, currencies that have
 * been retired or superseded: the provider still returns a rate for them, which
 * makes them look alive, but converting into one tells the reader nothing about
 * what money buys there today.
 */
const EXCLUDE = new Set([
  // Accounting units.
  "XDR", // IMF Special Drawing Rights
  "CLF", // Chile's inflation-indexed Unidad de Fomento
  "XTS", // reserved for testing
  "XXX", // "no currency"
  "XAU", "XAG", "XPT", "XPD", // precious metals

  // Retired or superseded.
  "HRK", // Croatia adopted the euro 2023-01-01; the kuna is gone
  "BGN", // Bulgaria adopted the euro 2026-01-01; lev ceased legal tender 2026-02-01
  "ANG", // ceased legal tender 2025-07-01, superseded by XCG
  "SLL", // redenominated to SLE in 2022 (1000:1)
  "ZWL", // replaced by ZWG (the "ZiG") in April 2024

  // Not a separate country's money.
  "CNH", // offshore renminbi — the same currency as CNY, quoted off-shore
]);

// Codes whose first two letters are not their issuing country.
const COUNTRY_OVERRIDE = {
  EUR: ["EU", "European Union"],
  XOF: ["SN", "West African CFA zone"],
  XAF: ["CM", "Central African CFA zone"],
  XCD: ["AG", "Eastern Caribbean"],
  XCG: ["CW", "Curaçao & Sint Maarten"],
  XPF: ["PF", "French Pacific"],
  ANG: ["CW", "Curaçao"],
};

// Flag emoji only exist for real regions; the shared-currency rows borrow the
// flag of a representative member, which the alias list then makes searchable.
const FLAG_OVERRIDE = { EUR: "🇪🇺", XOF: "🇸🇳", XAF: "🇨🇲", XCD: "🇦🇬", XPF: "🇵🇫", XCG: "🇨🇼" };

// Extra searchable names, so "Spain" finds EUR and "Ivory Coast" finds XOF.
const ALIASES = {
  EUR: ["Austria","Belgium","Bulgaria","Croatia","Cyprus","Estonia","Finland","France","Germany","Greece","Ireland","Italy","Latvia","Lithuania","Luxembourg","Malta","Netherlands","Portugal","Slovakia","Slovenia","Spain","Eurozone"],
  XOF: ["Benin","Burkina Faso","Côte d'Ivoire","Ivory Coast","Guinea-Bissau","Mali","Niger","Senegal","Togo"],
  XAF: ["Cameroon","Central African Republic","Chad","Congo","Equatorial Guinea","Gabon"],
  XCD: ["Antigua and Barbuda","Dominica","Grenada","Saint Kitts and Nevis","Saint Lucia","Saint Vincent and the Grenadines","Anguilla","Montserrat"],
  XPF: ["French Polynesia","New Caledonia","Wallis and Futuna","Tahiti"],
  XCG: ["Curaçao","Sint Maarten"],
  USD: ["Ecuador","El Salvador","Panama","Timor-Leste","Zimbabwe","Puerto Rico"],
  AUD: ["Kiribati","Nauru","Tuvalu"],
  NZD: ["Cook Islands","Niue","Tokelau"],
  CHF: ["Liechtenstein"],
  ZAR: ["Lesotho","Namibia","Eswatini"],
  GBP: ["Isle of Man","Jersey","Guernsey","England","Scotland","Wales","Northern Ireland"],
  INR: ["Bhutan"],
  DKK: ["Greenland","Faroe Islands"],
  MAD: ["Western Sahara"],
  TRY: ["Northern Cyprus"],
  JOD: ["Palestine","West Bank"],
  ILS: ["Palestine","Gaza"],
  SGD: ["Brunei"],
};

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
const currencyNames = new Intl.DisplayNames(["en"], { type: "currency" });

function flagFor(cc) {
  return String.fromCodePoint(...[...cc].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

function intlFor(code) {
  const fmt = new Intl.NumberFormat("en", { style: "currency", currency: code });
  const parts = fmt.formatToParts(1);
  return {
    symbol: parts.find((p) => p.type === "currency")?.value ?? code,
    decimals: fmt.resolvedOptions().maximumFractionDigits ?? 2,
  };
}

const res = await fetch("https://open.er-api.com/v6/latest/USD");
const { rates } = await res.json();

const existing = new Map(CURRENCIES.map((c) => [c.code, c]));
const rows = [];

for (const code of Object.keys(rates).sort()) {
  if (EXCLUDE.has(code)) continue;

  const prior = existing.get(code);
  const [ovCc, ovCountry] = COUNTRY_OVERRIDE[code] ?? [];
  const cc = ovCc ?? prior?.countryCode ?? code.slice(0, 2);

  let country = ovCountry ?? prior?.country;
  if (!country) {
    const derived = regionNames.of(cc);
    if (!derived || derived === cc) continue; // not a real region; skip
    country = derived;
  }

  const derivedIntl = intlFor(code);
  rows.push({
    code,
    name: prior?.name ?? currencyNames.of(code) ?? code,
    // Hand-curated symbols beat Intl's, which often just echoes the code.
    symbol: prior?.symbol ?? derivedIntl.symbol,
    // Existing decimals encode deliberate calls (IDR shown as 0, not ISO's 2).
    decimals: prior?.decimals ?? derivedIntl.decimals,
    countryCode: cc,
    country,
    flag: FLAG_OVERRIDE[code] ?? prior?.flag ?? flagFor(cc),
    popular: prior?.popular ?? false,
    aliases: ALIASES[code],
  });
}

const body = rows
  .map((r) => {
    const lines = [
      `    code: ${JSON.stringify(r.code)},`,
      `    name: ${JSON.stringify(r.name)},`,
      `    symbol: ${JSON.stringify(r.symbol)},`,
      `    decimals: ${r.decimals},`,
      `    countryCode: ${JSON.stringify(r.countryCode)},`,
      `    country: ${JSON.stringify(r.country)},`,
      `    flag: ${JSON.stringify(r.flag)},`,
    ];
    if (r.popular) lines.push(`    popular: true,`);
    if (r.aliases) lines.push(`    aliases: ${JSON.stringify(r.aliases)},`);
    return `  {\n${lines.join("\n")}\n  },`;
  })
  .join("\n");

const header = `/**
 * Every currency the rate provider quotes — the full fiat list, so any pair a
 * user can name is convertible. Having a currency here does NOT imply we have a
 * price basket for it; that set is much smaller and lives in data/baskets.
 *
 * Rows carry the display metadata the UI needs: the native symbol locals write,
 * the primary issuing country (code, name, flag) and the ISO 4217 minor unit.
 *
 * MINOR-UNIT CAVEAT. \`decimals\` is the minor unit *as users expect to see it*,
 * which diverges from ISO 4217 in one place: ISO gives IDR two decimals, but the
 * sen has been worthless for decades and rupiah are written whole, so IDR is 0.
 * The three-decimal Gulf and North African dinars (BHD, JOD, KWD, OMR, TND) and
 * the zero-decimal CLP, ISK, JPY, KRW, UGX and VND all match ISO.
 * \`decimals\` describes *display* precision only — never round with it before a
 * conversion, only after.
 *
 * SHARED CURRENCIES. EUR, XOF, XAF, XCD, XPF and XCG have no single issuing
 * country, so they carry a representative flag plus an \`aliases\` list naming
 * every member state. Search matches aliases, so "Spain" finds the euro and
 * "Ivory Coast" finds the West African CFA franc. Dollarised and pegged users
 * (Panama → USD, Liechtenstein → CHF) are listed the same way.
 *
 * Pure accounting units are deliberately absent: XDR (IMF Special Drawing
 * Rights) and CLF (Chile's inflation-indexed Unidad de Fomento) are quoted by
 * the provider but are not money anyone spends.
 *
 * Generated against the provider's live list, with hand-curated rows preserved.
 * Sorted by \`code\`. No external dependencies.
 */

export type Currency = {
  /** ISO 4217 alphabetic code, e.g. "VND". */
  code: string;
  /** English name of the currency, e.g. "Vietnamese Dong". */
  name: string;
  /** Native symbol where one exists, e.g. "₫". Falls back to the code. */
  symbol: string;
  /** Minor-unit digits for display. See the caveat above. */
  decimals: number;
  /** ISO 3166-1 alpha-2 of the primary (or representative) country. */
  countryCode: string;
  /** Human-readable country, or the zone name for a shared currency. */
  country: string;
  /** Flag emoji matching \`countryCode\`. */
  flag: string;
  /** Set on the most-traded currencies, surfaced first in pickers. */
  popular?: boolean;
  /** Extra country names the search should match. */
  aliases?: readonly string[];
};

const DATA: readonly Currency[] = [
${body}
];

export const CURRENCIES: readonly Currency[] = DATA;

export const CURRENCY_BY_CODE: ReadonlyMap<string, Currency> = new Map(
  DATA.map((currency) => [currency.code, currency]),
);

export function getCurrency(code: string): Currency | undefined {
  return CURRENCY_BY_CODE.get(code.toUpperCase());
}

export const POPULAR_CODES: readonly string[] = DATA.filter(
  (currency) => currency.popular,
).map((currency) => currency.code);
`;

writeFileSync(OUT, header);
console.log("wrote", rows.length, "currencies");
console.log("with aliases:", rows.filter((r) => r.aliases).length);
