// The hero's example check: a cosmetics label with each check marked
// "Meets rule" or "Action needed", the same words and colours as the real
// results page. Counts, not a percentage score, as on the results page.
const checks = [
  { label: "Responsible Person address", ok: true },
  { label: "Fragrance allergens (EU 2026)", ok: true },
  { label: "PAO / date of minimum durability", ok: false },
  { label: "Nominal content", ok: true },
  { label: "INCI ingredient list", ok: false },
];

const RADIUS = 34;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const HeroCheckCard = () => {
  const passed = checks.filter((c) => c.ok).length;
  return (
    <div className="rounded-xl border bg-background/80 backdrop-blur p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-muted-foreground">Example label check</div>
        <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-muted">Face serum · 30 ml</span>
      </div>
      <div className="flex items-center gap-5">
        <div className="relative h-20 w-20 shrink-0">
          <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90" aria-hidden="true">
            <circle cx="40" cy="40" r={RADIUS} fill="none" strokeWidth="7" className="stroke-muted" />
            <circle
              cx="40"
              cy="40"
              r={RADIUS}
              fill="none"
              strokeWidth="7"
              strokeLinecap="round"
              className="stroke-primary"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - passed / checks.length)}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-semibold tabular-nums leading-none">
              {passed}/{checks.length}
            </span>
          </div>
        </div>
        <div className="text-sm">
          <p className="font-medium">{passed} checks met</p>
          <p className="text-muted-foreground">
            {checks.length - passed} need action before print
          </p>
        </div>
      </div>
      <div className="space-y-2 pt-1">
        {checks.map((c) => (
          <div key={c.label} className="flex items-center justify-between gap-3 text-xs">
            <span className="text-foreground/80">{c.label}</span>
            <span className={`${c.ok ? "compliance-badge-high" : "compliance-badge-low"} text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0`}>
              {c.ok ? "Meets rule" : "Action needed"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HeroCheckCard;
