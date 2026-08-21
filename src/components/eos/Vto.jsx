import { VTO } from '../../data/eosVto';
import { SectionCard } from './bits';

// The vision side of the V/TO. Read-only by design — it is prose, it changes at
// most once a year, and it renders from src/data/eosVto.js rather than the
// database (see the note at the top of that file).

function Bullets({ items, className = '' }) {
  return (
    <ul className={`space-y-1 ${className}`}>
      {items.map((t) => (
        <li key={t} className="flex gap-2 text-[11px] text-md leading-snug">
          <span className="text-pk mt-[3px] text-[7px]">●</span>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[8px] font-bold uppercase tracking-wider text-gr mb-1">{label}</div>
      <div className="text-[11px] text-md leading-snug">{children}</div>
    </div>
  );
}

function Horizon({ label, horizon, revenue, profit }) {
  return (
    <div className="flex items-baseline gap-2 flex-wrap">
      <span className="text-[13px] font-black text-pk">{revenue}</span>
      {profit && <span className="text-[11px] font-semibold text-md">{profit}</span>}
      <span className="text-[9px] uppercase tracking-wider text-gr">{label} · {horizon}</span>
    </div>
  );
}

export default function Vto() {
  return (
    <div className="space-y-3">
      <div className="bg-cd border border-lt rounded-xl px-4 py-3">
        <div className="text-[12px] font-bold text-dk">Vision / Traction Organizer — vision side</div>
        <div className="text-[10px] text-gr mt-0.5 leading-snug">{VTO.sourceNote}</div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <SectionCard title="Core Values" subtitle="Who we are. Hire, fire, review and reward by these.">
          <div className="px-4 py-3">
            <Bullets items={VTO.coreValues} />
          </div>
        </SectionCard>

        <SectionCard title="Core Focus" subtitle="Why we exist, and what we are uniquely good at.">
          <div className="px-4 py-3 space-y-3">
            <Field label="Purpose / Cause / Passion">{VTO.coreFocus.purpose}</Field>
            <Field label="Our Niche">{VTO.coreFocus.niche}</Field>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Long-term targets">
        <div className="px-4 py-3 grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Horizon label="5-year target" horizon={VTO.fiveYear.horizon} revenue="$200M" />
            <div className="text-[11px] text-md leading-snug">{VTO.fiveYear.headline}</div>
          </div>

          <div className="space-y-2">
            <Horizon
              label="3-year picture"
              horizon={VTO.threeYear.horizon}
              revenue={VTO.threeYear.revenue}
              profit={VTO.threeYear.profit}
            />
            <Bullets items={VTO.threeYear.looksLike} />
          </div>

          <div className="space-y-2">
            <Horizon
              label="1-year plan"
              horizon={VTO.oneYear.horizon}
              revenue={VTO.oneYear.revenue}
              profit={VTO.oneYear.profit}
            />
            <Bullets items={VTO.oneYear.goals} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Marketing Strategy">
        <div className="px-4 py-3 grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <Field label="Target Market / The List">{VTO.marketing.targetMarket}</Field>
            <Field label="Proven Process">{VTO.marketing.provenProcess}</Field>
            <Field label="Guarantee">{VTO.marketing.guarantee}</Field>
          </div>
          <div>
            <div className="text-[8px] font-bold uppercase tracking-wider text-gr mb-1">Three Uniques</div>
            <Bullets items={VTO.marketing.uniques} />
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
