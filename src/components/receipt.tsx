"use client";

import { AnimatePresence, motion } from "motion/react";
import type { Basket } from "@/lib/basket-types";
import { STALE_AFTER_MONTHS, type BasketLine } from "@/lib/basket-select";
import type { Currency } from "@/lib/currencies";
import { formatMoney, formatRate } from "@/lib/format";

type ReceiptProps = {
  amount: number;
  from: Currency;
  to: Currency;
  rate: number;
  converted: number;
  basket: Basket | null;
  lines: BasketLine[];
  wageNote: string | null;
  ageMonths: number;
  stale: boolean;
};

/**
 * The result, set as a page from a ledger rather than a floating card: flush
 * to the grid, ruled top and bottom, no rotation and no drop shadow. The
 * earlier version tilted the panel for tactility, and in a layout this spare
 * that reads as misalignment rather than craft.
 */
export function Receipt({
  amount,
  from,
  to,
  rate,
  converted,
  basket,
  lines,
  wageNote,
  ageMonths,
  stale,
}: ReceiptProps) {
  return (
    <div
      className={`transition-opacity duration-200 ${stale ? "opacity-40" : "opacity-100"}`}
    >
      {/* A hairline between question and answer. The meander that used to sit
          here was ornament for its own sake once the layout tightened. */}
      <hr className="rule-double" />

      <div className="flex items-baseline justify-between pt-5">
        <p className="inscribed">{formatMoney(amount, from)} buys</p>
        <p className="inscribed tnum">
          {from.code} → {to.code}
        </p>
      </div>

      <AnimatePresence mode="popLayout" initial={false}>
        <motion.p
          key={`${to.code}-${Math.round(converted * 100)}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6, position: "absolute" }}
          transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
          className="tnum mt-1 font-display text-[clamp(2.9rem,7vw,4.3rem)] font-light leading-none tracking-[-0.015em] text-ink"
        >
          {formatMoney(converted, to)}
        </motion.p>
      </AnimatePresence>

      <p className="tnum mt-3 text-[13.5px] text-ink-faint">
        1 {from.code} = {formatRate(rate)} {to.code}
      </p>

      {basket ? (
        <>
          <hr className="rule-double mt-7" />

          <h2 className="mt-6 font-display text-[30px] font-light italic leading-none text-ink">
            In {basket.city}, that&rsquo;s
          </h2>

          <ul className="mt-4">
            {lines.map((line, index) => (
              <ItemRow key={line.item.id} line={line} index={index} />
            ))}
          </ul>

          {lines.length === 0 && (
            <p className="mt-4 text-[15.5px] text-ink-soft">
              Not enough to price against anything here.
            </p>
          )}

          {wageNote && (
            <p className="mt-6 border-l border-oxblood/50 pl-3.5 font-display text-[18px] italic leading-relaxed text-ink-soft">
              {wageNote}
            </p>
          )}

          <p className="mt-7 max-w-xl text-[13px] leading-relaxed text-ink-faint">
            {basket.estimated ? (
              <>
                Estimated prices for {basket.city}, {basket.updated}. We
                haven&rsquo;t been able to source these locally yet — the
                proportions are right, but treat the amounts as a sketch.
              </>
            ) : (
              <>
                Typical local prices in {basket.city}, checked {basket.updated}.
                Not quotes — the real world varies by street, by season, and by
                how well you haggle.
              </>
            )}
            {ageMonths >= STALE_AFTER_MONTHS && (
              <span className="text-oxblood">
                {" "}
                That was {ageMonths} months ago, so treat these as a rough shape
                rather than today&rsquo;s prices.
              </span>
            )}
          </p>
        </>
      ) : (
        <NoBasket to={to} />
      )}
    </div>
  );
}

function ItemRow({ line, index }: { line: BasketLine; index: number }) {
  const { item, phrase, partial } = line;

  return (
    <motion.li
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.35,
        delay: Math.min(index * 0.04, 0.24),
        ease: [0.16, 1, 0.3, 1],
      }}
      className="border-b border-rule/40 py-2.5 last:border-0"
    >
      {/* Label, leader and count share a line so the rule runs clean; the
          qualifier sits beneath rather than breaking it. */}
      <div className="flex items-end gap-2">
        <span aria-hidden className="w-7 shrink-0 text-[17px] leading-tight">
          {item.icon}
        </span>
        <span className="min-w-0 shrink font-display text-[22px] leading-tight text-ink">
          {item.label}
        </span>
        <span aria-hidden className="leader" />
        <span
          className={`tnum shrink-0 text-[14.5px] leading-tight ${
            partial ? "text-ink-faint" : "font-medium text-olive"
          }`}
        >
          {partial ? phrase : `× ${phrase}`}
        </span>
      </div>

      {item.note && (
        <p className="ml-9 mt-0.5 text-[13px] leading-snug text-ink-faint">
          {item.note}
        </p>
      )}
    </motion.li>
  );
}

function NoBasket({ to }: { to: Currency }) {
  return (
    <>
      <hr className="rule-double mt-7" />
      <h2 className="mt-6 font-display text-[30px] font-light italic leading-none text-ink">
        We haven&rsquo;t priced {to.country} yet
      </h2>
      <p className="mt-3 max-w-md text-[15.5px] leading-relaxed text-ink-soft">
        The conversion above is good. The shopping list isn&rsquo;t built — every
        basket is checked by hand, and this one is still on the list.
      </p>
    </>
  );
}
