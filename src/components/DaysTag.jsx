// Urgency tag — ported from prototype's <DaysTag>. Same 4-tier coloring used
// by the Days and Ship-to-DOT columns: ≤1 red, ≤3 orange, ≤7 amber, >7 green.
function tier(d) {
  if (d <= 1) return 'text-red-600 bg-red-100';
  if (d <= 3) return 'text-amber-600 bg-amber-100';
  if (d <= 7) return 'text-yellow-700 bg-yellow-50';
  return 'text-emerald-600 bg-emerald-50';
}

export default function DaysTag({ days }) {
  if (days == null) return <span className="text-gr text-[9px]">--</span>;
  return (
    <span className={`px-[7px] py-[2px] rounded-full text-[9px] font-bold ${tier(days)}`}>
      {days < 0 ? 'OVERDUE' : days === 0 ? 'TODAY' : `${days}d`}
    </span>
  );
}
