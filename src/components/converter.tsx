"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import type { Basket } from "@/lib/basket-types";
import { selectLines, wageContext } from "@/lib/basket-select";
import { getCurrency, type Currency } from "@/lib/currencies";
import { parseAmount } from "@/lib/format";
import { toSearchParams } from "@/lib/search-params";
import { CurrencySelect } from "./currency-select";
import { Receipt } from "./receipt";

type ConverterProps = {
  amount: number;
  from: string;
  to: string;
  /** Cross-rate from→to, resolved on the server. */
  rate: number;
  /** Destination basket, or null when we have not priced that country. */
  basket: Basket | null;
  /** Age of that basket in months, computed server-side. */
  basketAgeMonths: number;
  basketCurrencies: string[];
};

/** How long to wait after typing before rewriting the URL. */
const URL_SYNC_MS = 450;

export function Converter({
  amount: initialAmount,
  from: initialFrom,
  to: initialTo,
  rate,
  basket,
  basketAgeMonths,
  basketCurrencies,
}: ConverterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const [raw, setRaw] = useState(() => String(initialAmount));
  const [pair, setPair] = useState({ from: initialFrom, to: initialTo });
  const [seen, setSeen] = useState({ from: initialFrom, to: initialTo });

  // Currency changes need fresh server data (a new rate and a new basket), so
  // props are authoritative for the pair. Adopt an incoming pair during render
  // rather than in an effect — the effect version renders once with stale data
  // and then immediately again.
  //
  // Skipped while a navigation is in flight: mid-transition the props still
  // describe the *previous* pair, and adopting them would undo a change the
  // user made while waiting.
  if (
    !isPending &&
    (seen.from !== initialFrom || seen.to !== initialTo)
  ) {
    setSeen({ from: initialFrom, to: initialTo });
    setPair({ from: initialFrom, to: initialTo });
  }

  const { from, to } = pair;
  const setFrom = (next: string) => setPair((p) => ({ ...p, from: next }));
  const setTo = (next: string) => setPair((p) => ({ ...p, to: next }));

  const fromCurrency = getCurrency(from) ?? getCurrency("USD")!;
  const toCurrency = getCurrency(to) ?? getCurrency("EUR")!;

  const amount = parseAmount(raw) ?? 0;

  // The amount is applied locally so typing stays instant; only the currency
  // pair round-trips. `rate` therefore lags by exactly one navigation, which
  // is what `isPending` dims.
  const converted = amount * rate;

  const lines = useMemo(
    () => (basket ? selectLines(basket, converted) : []),
    [basket, converted],
  );
  const wageNote = useMemo(
    () => (basket ? wageContext(basket, converted) : null),
    [basket, converted],
  );

  // Keep the URL shareable without pushing a history entry per keystroke.
  const lastPushed = useRef(toSearchParams({ amount: initialAmount, from: initialFrom, to: initialTo }));
  useEffect(() => {
    const query = toSearchParams({ amount, from, to });
    if (query === lastPushed.current) return;

    const timer = setTimeout(() => {
      lastPushed.current = query;
      startTransition(() => {
        // Cast: typedRoutes cannot know a query string built at runtime.
        router.replace(`${pathname}${query}` as Route, { scroll: false });
      });
    }, URL_SYNC_MS);

    return () => clearTimeout(timer);
  }, [amount, from, to, pathname, router]);

  function swap() {
    setPair((p) => ({ from: p.to, to: p.from }));
  }

  return (
    <div className="flex flex-col gap-7">
      <section
        className="rise"
        style={{ "--i": 1 } as React.CSSProperties}
        aria-label="Conversion"
      >
        {/* The question is the page's headline. It explains the product more
            directly than any strapline above it could, so nothing sits above
            it and the answer follows immediately. */}
        <div className="font-display text-[clamp(2.05rem,4.6vw,3.05rem)] font-light leading-[1.35] text-ink-soft">
          <span>What does </span>

          <AmountField
            value={raw}
            onChange={setRaw}
            currency={fromCurrency}
            label="How much?"
          />

          <CurrencySelect
            value={from}
            onChange={setFrom}
            label="From"
            pricedCurrencies={basketCurrencies}
          />

          <span> buy in </span>

          <CurrencySelect
            value={to}
            onChange={setTo}
            label="Spent in"
            showCountry
            pricedCurrencies={basketCurrencies}
          />

          <span>?</span>
        </div>

        <button
          type="button"
          onClick={swap}
          className="group inscribed mt-6 inline-flex items-center gap-2 transition-colors hover:text-olive"
        >
          <span
            aria-hidden
            className="transition-transform duration-300 group-hover:rotate-180"
          >
            ⇄
          </span>
          Turn it around
        </button>

      </section>

      <section
        className="rise"
        style={{ "--i": 2 } as React.CSSProperties}
        aria-live="polite"
        aria-label="Result"
      >
        <Receipt
          amount={amount}
          from={fromCurrency}
          to={toCurrency}
          rate={rate}
          converted={converted}
          basket={basket}
          lines={lines}
          wageNote={wageNote}
          ageMonths={basketAgeMonths}
          stale={isPending}
        />
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------- fields */

function AmountField({
  value,
  onChange,
  currency,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  currency: Currency;
  label: string;
}) {
  // Width tracks content so the sentence closes up around the number instead
  // of leaving a fixed-width gap in the middle of a line of prose.
  const width = `${Math.max(value.length, 1) + 0.4}ch`;

  return (
    <span className="relative mr-2 inline-flex items-baseline">
      <label className="sr-only" htmlFor="amount">
        {label}
      </label>
      <span aria-hidden className="pr-1 text-ink-faint">
        {currency.symbol}
      </span>
      <input
        id="amount"
        name="amount"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={(event) => event.target.select()}
        style={{ width }}
        className="tnum border-b border-oxblood/45 bg-transparent pb-0.5 text-center text-[0.9em] text-ink transition-colors focus:border-oxblood focus:outline-none"
      />
    </span>
  );
}
