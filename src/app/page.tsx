import { Suspense } from "react";
import { Converter } from "@/components/converter";
import { RateError } from "@/components/rate-error";
import { ThemeToggle } from "@/components/theme-toggle";
import { CURRENCIES_WITH_BASKETS, getBasket } from "@/lib/basket";
import { basketAgeMonths } from "@/lib/basket-select";
import { getCurrency } from "@/lib/currencies";
import { formatRelativeTime } from "@/lib/format";
import { crossRate, getRateTable, type RateTable } from "@/lib/rates";
import { parseConverterState } from "@/lib/search-params";

export default async function Page(props: PageProps<"/">) {
  const params = props.searchParams;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 sm:px-8">
      <Header />
      <main className="flex-1 pb-16 pt-6 sm:pt-10">
        {/* The visible headline is the converter's question. This keeps a
            plain-language title for screen readers and search. */}
        <h1 className="sr-only">
          Small Fortune — see what your money actually buys in another country
        </h1>
        <Suspense fallback={<ConverterSkeleton />}>
          <ConverterSection params={params} />
        </Suspense>
      </main>
      <Suspense fallback={<Footer updated={null} />}>
        <FooterWithFreshness />
      </Suspense>
    </div>
  );
}

async function ConverterSection({
  params,
}: {
  params: PageProps<"/">["searchParams"];
}) {
  const state = parseConverterState(await params);

  // The try wraps only the await, never the JSX.
  let table: RateTable | null = null;
  try {
    table = await getRateTable();
  } catch {
    table = null;
  }
  if (!table) return <RateError />;

  const rate = crossRate(table, state.from, state.to);
  if (rate === null) {
    return (
      <RateError
        message={`We have today's rates, but not for ${state.from} to ${state.to}. Try another pair.`}
      />
    );
  }

  const toCurrency = getCurrency(state.to);
  const basket = toCurrency
    ? (getBasket(toCurrency.code, toCurrency.countryCode) ?? null)
    : null;

  return (
    <Converter
      amount={state.amount}
      from={state.from}
      to={state.to}
      rate={rate}
      basket={basket}
      basketAgeMonths={basket ? basketAgeMonths(basket.updated) : 0}
      basketCurrencies={[...CURRENCIES_WITH_BASKETS]}
    />
  );
}

async function FooterWithFreshness() {
  let updated: string | null = null;
  try {
    updated = (await getRateTable()).updatedAt;
  } catch {
    // The freshness stamp is a nicety; its absence is not an error.
  }
  return <Footer updated={updated} />;
}

/* ------------------------------------------------------------------ chrome */

function Header() {
  return (
    <header
      className="rise flex items-baseline justify-between gap-6 py-6"
      style={{ "--i": 0 } as React.CSSProperties}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="font-display text-[22px] font-medium uppercase tracking-[0.2em] text-ink">
          Small Fortune
        </p>
        <p className="font-display text-[17px] italic text-ink-faint">
          your money, translated
        </p>
      </div>
      <ThemeToggle />
    </header>
  );
}

function ConverterSkeleton() {
  return (
    <p className="rise inscribed" style={{ "--i": 2 } as React.CSSProperties}>
      Checking the going rate&hellip;
    </p>
  );
}

function Footer({ updated }: { updated: string | null }) {
  return (
    <footer className="mt-auto pb-8 pt-10" aria-label="About and attribution">
      <hr className="rule-double" />
      <p className="mt-6 font-display text-[20px] font-light leading-snug text-ink">
        Money is just a number
        <span className="italic text-oxblood"> until you spend it.</span>
      </p>
      <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-md text-[14.5px] leading-relaxed text-ink-soft">
          Prices differ because lives differ. We think that&rsquo;s worth seeing
          clearly — not as a bargain, but as a fact about the world. Rates
          refresh daily; prices are what residents actually pay, not tourist
          menus.
        </p>
        <p className="inscribed shrink-0 leading-[2]">
          <a
            href="https://www.exchangerate-api.com"
            className="underline decoration-rule underline-offset-4 transition-colors hover:text-olive"
            target="_blank"
            rel="noreferrer"
          >
            Rates by ExchangeRate-API
          </a>
          {updated && (
            <>
              <br />
              Refreshed {formatRelativeTime(updated)}
            </>
          )}
        </p>
      </div>
    </footer>
  );
}
