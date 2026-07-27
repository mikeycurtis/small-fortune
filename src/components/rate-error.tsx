const DEFAULT_MESSAGE =
  "We couldn't fetch today's rates. Your money's fine — the internet isn't. Try again in a moment.";

export function RateError({ message = DEFAULT_MESSAGE }: { message?: string }) {
  return (
    <div className="max-w-md border-l border-oxblood/60 pl-5">
      <p className="inscribed text-oxblood">
        No rates
      </p>
      <p className="mt-3 font-display text-[20px] font-light leading-relaxed text-ink-soft">{message}</p>
    </div>
  );
}
