"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CURRENCIES, getCurrency, type Currency } from "@/lib/currencies";

/**
 * Searchable currency picker.
 *
 * A native <select> across 160+ currencies renders as an unusable wall of
 * options, so this is the ARIA combobox pattern instead: a trigger that reads as
 * part of the sentence, and a compact scrolling popover with type-to-filter.
 *
 * Filtering matches code, currency name, country and member-state aliases, so
 * "vietnam", "dong" and "vnd" all find the same row, and "Spain" finds the euro.
 * People know the country far more often than they know the ISO code.
 */

type CurrencySelectProps = {
  value: string;
  onChange: (code: string) => void;
  /** Accessible name; also the popover's heading. */
  label: string;
  /** Show the country rather than the ISO code in the trigger. */
  showCountry?: boolean;
  /** Codes we have a price basket for — surfaced first and marked. */
  pricedCurrencies: string[];
};

/** Strips accents so "cote" finds "Côte d'Ivoire" and "curacao" finds Curaçao. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Lower is a better match; -1 means no match at all. */
function matchScore(currency: Currency, query: string): number {
  const code = fold(currency.code);
  const country = fold(currency.country);
  const name = fold(currency.name);

  if (code === query) return 0;
  if (code.startsWith(query)) return 1;
  if (country.startsWith(query)) return 2;
  if (name.startsWith(query)) return 3;
  if (country.includes(query)) return 4;
  if (name.includes(query)) return 5;
  if (code.includes(query)) return 6;

  // Shared currencies (EUR, XOF, XCD…) and pegged users are only findable by
  // member-state name — "Spain" has to reach the euro somehow.
  for (const alias of currency.aliases ?? []) {
    const folded = fold(alias);
    if (folded.startsWith(query)) return 7;
    if (folded.includes(query)) return 8;
  }
  return -1;
}

export function CurrencySelect({
  value,
  onChange,
  label,
  showCountry = false,
  pricedCurrencies,
}: CurrencySelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const rootRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const listId = useId();
  const optionId = (index: number) => `${listId}-opt-${index}`;

  const priced = useMemo(
    () => new Set(pricedCurrencies),
    [pricedCurrencies],
  );
  const selected = getCurrency(value);

  const { options, headings, hints } = useMemo(() => {
    const trimmed = fold(query.trim());

    /**
     * When a row surfaced because of an alias rather than its own country,
     * name the alias — otherwise typing "Spain" returns "European Union" and
     * looks like a bug.
     */
    const hints = new Map<string, string>();
    if (trimmed) {
      for (const currency of CURRENCIES) {
        if (fold(currency.country).includes(trimmed)) continue;
        const hit = currency.aliases?.find((a) => fold(a).includes(trimmed));
        if (hit) hints.set(currency.code, hit);
      }
    }

    if (!trimmed) {
      // Resting state: two honest groups, priced first.
      const withBasket = CURRENCIES.filter((c) => priced.has(c.code));
      const rest = CURRENCIES.filter((c) => !priced.has(c.code));
      const headings = new Map<number, string>();
      if (withBasket.length) headings.set(0, "Priced in real things");
      if (rest.length) headings.set(withBasket.length, "Conversion only");
      return { options: [...withBasket, ...rest], headings, hints };
    }

    const ranked = CURRENCIES.map((currency) => ({
      currency,
      score: matchScore(currency, trimmed),
    }))
      .filter((entry) => entry.score >= 0)
      .sort(
        (a, b) =>
          a.score - b.score ||
          // Tie-break toward currencies we can actually price.
          Number(priced.has(b.currency.code)) -
            Number(priced.has(a.currency.code)) ||
          a.currency.code.localeCompare(b.currency.code),
      )
      .map((entry) => entry.currency);

    return { options: ranked, headings: new Map<number, string>(), hints };
  }, [query, priced]);

  // Focus the search field and start from the current value when opening.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const index = options.findIndex((c) => c.code === value);
    if (index > 0) {
      listRef.current
        ?.querySelector(`#${CSS.escape(optionId(index))}`)
        ?.scrollIntoView({ block: "center" });
    }
    // Only on open: re-running as `options` narrows would fight the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep the highlighted row visible as the user arrows through.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`#${CSS.escape(optionId(active))}`)
      ?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, open]);

  // Dismiss on outside pointer or Escape.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  });

  function close() {
    setOpen(false);
    setQuery("");
    setActive(0);
  }

  function commit(code: string) {
    onChange(code);
    close();
  }

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((i) => Math.min(i + 1, options.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(options.length - 1);
        break;
      case "Enter": {
        event.preventDefault();
        const choice = options[active];
        if (choice) commit(choice.code);
        break;
      }
      case "Tab":
        close();
        break;
    }
  }

  const trigger = showCountry
    ? (selected?.country ?? value)
    : (selected?.code ?? value);

  return (
    <span ref={rootRef} className="relative inline-block align-baseline">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${selected?.name ?? value}. Change currency`}
        className="inline-flex items-baseline whitespace-nowrap border-b border-olive/40 pb-0.5 transition-colors hover:border-olive focus-visible:border-olive"
      >
        <span aria-hidden className="mr-2 text-[0.62em] leading-none">
          {selected?.flag}
        </span>
        <span className="text-ink">{trigger}</span>
        <span
          aria-hidden
          className={`ml-1.5 text-[0.38em] text-ink-faint transition-transform ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          // The trigger sits inside display-serif sentence type at ~2.9rem;
          // the popover is UI, so it resets both family and size rather than
          // inheriting them.
          className="absolute left-0 top-[calc(100%+0.6rem)] z-50 w-[20rem] max-w-[calc(100vw-3rem)] overflow-hidden border border-rule bg-paper-raised font-sans text-base font-normal leading-normal tracking-normal shadow-[0_18px_44px_-24px_rgba(27,28,21,0.5)]"
        >
          <div className="border-b border-rule px-3 py-2.5">
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={
                options.length ? optionId(active) : undefined
              }
              aria-label={`Search currencies — ${label}`}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={onSearchKeyDown}
              placeholder="Search country or currency…"
              autoComplete="off"
              spellCheck={false}
              className="w-full bg-transparent font-sans text-[14.5px] text-ink placeholder:text-ink-faint focus:outline-none"
            />
          </div>

          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={label}
            className="max-h-[19rem] overflow-y-auto overscroll-contain py-1"
          >
            {options.map((currency, index) => {
              const isActive = index === active;
              const isSelected = currency.code === value;
              return (
                <li key={currency.code}>
                  {headings.get(index) && (
                    <p className="inscribed px-3 pb-1 pt-2.5">
                      {headings.get(index)}
                    </p>
                  )}
                  <div
                    id={optionId(index)}
                    role="option"
                    aria-selected={isSelected}
                    onPointerEnter={() => setActive(index)}
                    onClick={() => commit(currency.code)}
                    className={`flex cursor-pointer items-center gap-2.5 px-3 py-1.5 ${
                      isActive ? "bg-paper-sunk" : ""
                    }`}
                  >
                    <span aria-hidden className="text-[16px] leading-none">
                      {currency.flag}
                    </span>
                    <span
                      className={`w-10 shrink-0 text-[12px] tracking-wide ${
                        isSelected ? "text-olive" : "text-ink-soft"
                      }`}
                    >
                      {currency.code}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[14.5px] text-ink">
                      {currency.country}
                      {hints.get(currency.code) && (
                        <span className="ml-1.5 text-ink-faint">
                          · {hints.get(currency.code)}
                        </span>
                      )}
                    </span>
                    {priced.has(currency.code) && (
                      <span
                        aria-label="priced in real things"
                        title="We have a basket of real prices for this country"
                        className="size-1.5 shrink-0 rounded-full bg-olive/80"
                      />
                    )}
                  </div>
                </li>
              );
            })}

            {options.length === 0 && (
              <li className="px-3 py-4 text-[14.5px] text-ink-faint">
                Nothing matches “{query.trim()}”.
              </li>
            )}
          </ul>
        </div>
      )}
    </span>
  );
}
