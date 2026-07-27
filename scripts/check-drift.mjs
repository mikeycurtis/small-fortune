/**
 * Basket staleness canary.
 *
 * Curated local prices go stale silently — that is the failure mode of hand-built
 * data. Every basket carries exactly one `economist-bmi` row, and the Economist
 * republishes the Big Mac Index (CC BY 4.0) in local currency twice a year. So we
 * have one row per country whose *true* current value is knowable for free.
 *
 * Comparing our stored Big Mac price against the published one gives a per-country
 * drift signal. It does not prove the other 19 rows moved by the same amount — but
 * a country whose Big Mac has moved 30% almost certainly has a stale basket, and
 * one whose Big Mac has not moved probably does not. That is the difference between
 * re-checking 36 countries blind and re-checking the four that need it.
 *
 *   npm run check:drift            report only
 *   npm run check:drift -- --write also rewrite the economist-bmi rows
 *
 * `--write` touches ONLY the Big Mac rows, because those come straight from the
 * source. Everything else is deliberately left for a human: silently inflating
 * hand-checked prices would make the data look fresh while making it wrong.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { APAC_BASKETS } from "../src/data/baskets/apac.ts";
import { EUAM_BASKETS } from "../src/data/baskets/euam.ts";
import { AMEA_BASKETS } from "../src/data/baskets/amea.ts";

const SOURCE =
  "https://raw.githubusercontent.com/TheEconomist/big-mac-data/master/output-data/big-mac-full-index.csv";

const REGIONS = [
  ["apac", APAC_BASKETS],
  ["euam", EUAM_BASKETS],
  ["amea", AMEA_BASKETS],
];

/** Drift above this means the basket needs a human look. */
const REVIEW = 10;
const URGENT = 25;

const write = process.argv.includes("--write");

function parseCsv(text) {
  const [headerLine, ...lines] = text.trim().split("\n");
  const headers = headerLine.split(",");
  return lines.map((line) => {
    // The Economist's export has no quoted commas in the fields we read.
    const cells = line.split(",");
    return Object.fromEntries(headers.map((h, i) => [h, cells[i]]));
  });
}

const csv = parseCsv(await (await fetch(SOURCE)).text());
const latestDate = csv.map((r) => r.date).sort().at(-1);
const published = new Map(
  csv
    .filter((r) => r.date === latestDate)
    .map((r) => [r.currency_code, Number(r.local_price)]),
);

console.log(`Big Mac Index snapshot: ${latestDate} (${published.size} countries)\n`);

const findings = [];
for (const [region, baskets] of REGIONS) {
  for (const basket of baskets) {
    const row = basket.items.find((i) => i.source === "economist-bmi");
    if (!row) {
      findings.push({ region, basket, status: "no-canary" });
      continue;
    }
    const current = published.get(basket.currency);
    if (current === undefined || !Number.isFinite(current)) {
      findings.push({ region, basket, row, status: "not-published" });
      continue;
    }
    const drift = ((current - row.price) / row.price) * 100;

    // Direction of time matters more than size of gap. The index is published
    // twice a year; if our basket was checked AFTER the latest snapshot, a gap
    // is the expected result of forward-rolling an inflationary economy, not
    // evidence of staleness. Only an index newer than our data can indict us.
    const indexIsNewer = latestDate > `${basket.updated}-01`;
    findings.push({
      region,
      basket,
      row,
      current,
      drift,
      status: indexIsNewer ? "ok" : "ahead-of-index",
    });
  }
}

const measured = findings.filter((f) => f.status === "ok");
measured.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));

const pad = (s, n) => String(s).padEnd(n);
if (measured.length) {
  console.log(
    pad("country", 22) + pad("cur", 5) + pad("ours", 12) + pad("published", 12) + "drift",
  );
  console.log("-".repeat(62));
}

for (const f of measured) {
  const mark =
    Math.abs(f.drift) >= URGENT ? "  <-- REFRESH" : Math.abs(f.drift) >= REVIEW ? "  <- review" : "";
  console.log(
    pad(f.basket.country, 22) +
      pad(f.basket.currency, 5) +
      pad(f.row.price.toLocaleString("en-US"), 12) +
      pad(f.current.toLocaleString("en-US"), 12) +
      `${f.drift >= 0 ? "+" : ""}${f.drift.toFixed(1)}%` +
      mark,
  );
}

const ahead = findings.filter((f) => f.status === "ahead-of-index");
if (ahead.length) {
  console.log(
    `\nChecked after the ${latestDate} snapshot — a gap here is a forward-roll,` +
      `\nnot staleness. Shown for information; never auto-written.`,
  );
  for (const f of ahead) {
    const sign = f.drift >= 0 ? "+" : "";
    console.log(
      `  ${pad(f.basket.country, 20)} ours ${pad(f.row.price.toLocaleString("en-US"), 10)}` +
        ` vs index ${pad(f.current.toLocaleString("en-US"), 10)} (${sign}${f.drift.toFixed(1)}%)` +
        `  checked ${f.basket.updated}`,
    );
  }
}

const unmeasured = findings.filter(
  (f) => f.status === "no-canary" || f.status === "not-published",
);
if (unmeasured.length) {
  console.log(`\nNo canary (Big Mac not published there) — refresh on the calendar:`);
  for (const f of unmeasured) {
    console.log(`  ${f.basket.country} (${f.basket.currency})`);
  }
}

const urgent = measured.filter((f) => Math.abs(f.drift) >= URGENT);
const review = measured.filter(
  (f) => Math.abs(f.drift) >= REVIEW && Math.abs(f.drift) < URGENT,
);

console.log(
  `\n${measured.length} measurable · ${urgent.length} need a refresh · ` +
    `${review.length} worth reviewing · ${ahead.length} ahead of the index · ` +
    `${unmeasured.length} unmeasurable`,
);

if (!write) {
  if (urgent.length || review.length) {
    console.log(
      `\nRe-check these baskets by hand, then update their \`updated\` field.` +
        `\nRun with --write to refresh just the Big Mac rows from the source.`,
    );
  }
  process.exit(0);
}

/* ------------------------------------------------------------------ --write */

let written = 0;
for (const [region] of REGIONS) {
  const path = new URL(`../src/data/baskets/${region}.ts`, import.meta.url);
  let text = readFileSync(path, "utf8");

  // Locate each basket by its country marker so we edit the right Big Mac row.
  const marks = [...text.matchAll(/country: "([^"]+)"/g)].map((m) => ({
    at: m.index,
    country: m[1],
  }));

  const edits = [];
  for (const item of [...text.matchAll(/source: "economist-bmi"/g)]) {
    const owner = marks.filter((m) => m.at < item.index).at(-1);
    const finding = measured.find(
      (f) => f.region === region && f.basket.country === owner?.country,
    );
    if (!finding || finding.current === finding.row.price) continue;

    // The `price:` line belongs to the object this source line closes.
    const before = text.slice(0, item.index);
    const priceAt = before.lastIndexOf("price: ");
    const priceEnd = text.indexOf(",", priceAt);
    edits.push({ priceAt, priceEnd, value: finding.current });
  }

  for (const e of edits.sort((a, b) => b.priceAt - a.priceAt)) {
    text = text.slice(0, e.priceAt) + `price: ${e.value}` + text.slice(e.priceEnd);
    written++;
  }
  if (edits.length) writeFileSync(path, text);
}

console.log(
  `\nUpdated ${written} Big Mac row${written === 1 ? "" : "s"} from the ${latestDate} index.` +
    `\nThe other rows are untouched — re-check the flagged baskets by hand.`,
);
