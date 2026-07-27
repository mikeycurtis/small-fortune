import { getCurrency } from "./currencies";
import { parseAmount } from "./format";

/**
 * The converter's entire state lives in the URL, which makes every result
 * shareable and the back button meaningful. This module is the single place
 * that decides what a valid state is, so the server and the client can never
 * disagree about how to read a link.
 */

export type ConverterState = {
  amount: number;
  from: string;
  to: string;
};

export const DEFAULT_STATE: ConverterState = {
  amount: 20,
  from: "USD",
  to: "VND",
};

/** Above this, formatting stops being meaningful and starts being a stunt. */
const MAX_AMOUNT = 1_000_000_000_000;

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function readCode(
  raw: string | string[] | undefined,
  fallback: string,
): string {
  const candidate = first(raw)?.trim().toUpperCase();
  return candidate && getCurrency(candidate) ? candidate : fallback;
}

/**
 * Never throws and never returns an unusable state — a malformed link should
 * degrade to the default conversion rather than to an error page.
 */
export function parseConverterState(params: RawParams): ConverterState {
  const from = readCode(params.from, DEFAULT_STATE.from);
  const to = readCode(params.to, DEFAULT_STATE.to);

  const parsed = parseAmount(first(params.amount) ?? "");
  const amount =
    parsed === null || parsed < 0 || !Number.isFinite(parsed)
      ? DEFAULT_STATE.amount
      : Math.min(parsed, MAX_AMOUNT);

  return { amount, from, to };
}

/** Builds the canonical query string, omitting anything at its default. */
export function toSearchParams(state: ConverterState): string {
  const params = new URLSearchParams();
  if (state.amount !== DEFAULT_STATE.amount) {
    params.set("amount", String(state.amount));
  }
  if (state.from !== DEFAULT_STATE.from) params.set("from", state.from);
  if (state.to !== DEFAULT_STATE.to) params.set("to", state.to);

  const query = params.toString();
  return query ? `?${query}` : "";
}
