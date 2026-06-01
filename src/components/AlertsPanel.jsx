import { Link } from 'react-router-dom';
import { useAlerts } from '../hooks/useAlerts';

// Computed-alerts banner (BUILD_PLAN 7.2). Sits at the top of pages that
// need "what's on fire right now" — currently Product Orders + the EOS
// Issues list inside Weekly Report.

export default function AlertsPanel({ title = 'Attention', max = 8, compact = false }) {
  const { alerts, loading } = useAlerts();
  if (loading) return null;
  if (!alerts.length) return null;

  const visible = alerts.slice(0, max);
  const rest = alerts.length - visible.length;

  return (
    <div className={`bg-cd border border-lt rounded-xl ${compact ? 'px-3 py-2' : 'px-3 py-2.5 mb-3'}`}>
      <div className="text-[8px] font-bold uppercase tracking-wider text-pk mb-1">
        {title} ({alerts.length})
      </div>
      <div>
        {visible.map((a, i) => {
          const dot = a.severity === 'crit' ? 'bg-red-500' : 'bg-amber-500';
          const body = (
            <>
              <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${dot}`} />
              <span>{a.message}</span>
            </>
          );
          return a.href ? (
            <Link
              key={a.id}
              to={a.href}
              className={[
                'flex gap-1.5 py-0.5 text-[10px] text-md hover:text-pk',
                i ? 'border-t border-bg pt-1' : '',
              ].join(' ')}
            >
              {body}
            </Link>
          ) : (
            <div
              key={a.id}
              className={[
                'flex gap-1.5 py-0.5 text-[10px] text-md',
                i ? 'border-t border-bg pt-1' : '',
              ].join(' ')}
            >
              {body}
            </div>
          );
        })}
        {rest > 0 && (
          <div className="text-[9px] text-gr italic mt-1">+ {rest} more</div>
        )}
      </div>
    </div>
  );
}
