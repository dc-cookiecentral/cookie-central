import { useEffect, useState } from 'react';
import { useGmailStatus, checkForNew, gmailConnectUrl } from '../hooks/useGmail';
import { formatDate } from '../utils/dates';

// systems@ inbox card on /uploads: connect Gmail (read-only OAuth) and pull new
// mail on demand. The daily pg_cron job runs the same poll unattended. New mail
// is classified (PO / BOL / supplier_confirmation / assemblers_report /
// weekly_report / other) and acted on by the Edge functions — structured
// extraction into po_emails, or auto-import of the Assemblers / weekly reports.
export default function InboxCard({ onPolled }) {
  const { status, loading, refresh } = useGmailStatus();
  const [polling, setPolling] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [banner, setBanner] = useState(null);

  // Surface the post-OAuth redirect (?gmail=connected|error&msg=...).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const g = params.get('gmail');
    if (g === 'connected') setBanner({ kind: 'ok', text: 'Gmail connected — systems@ is now linked.' });
    else if (g === 'error') setBanner({ kind: 'err', text: `Connection failed: ${params.get('msg') || 'unknown error'}` });
    if (g) {
      params.delete('gmail');
      params.delete('msg');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
      refresh();
    }
  }, [refresh]);

  const connected = !!status?.connected_email;

  const onCheck = async () => {
    setPolling(true);
    setError(null);
    setResult(null);
    const { data, error } = await checkForNew();
    if (error) setError(error);
    else {
      setResult(data);
      refresh();
      onPolled?.();
    }
    setPolling(false);
  };

  return (
    <section className="mb-6">
      <div className="mb-2">
        <div className="text-[11px] font-extrabold uppercase tracking-wider text-pk">systems@ Inbox</div>
        <div className="text-[10px] text-gr mt-0.5 max-w-2xl">
          AI email agent — reads systems@dirtycookie.com (read-only), classifies each message, and files
          POs, BOLs, supplier confirmations, the Assemblers report, and the weekly into their tables. Runs
          daily; check on demand here.
        </div>
      </div>

      <div className="bg-cd border border-lt rounded-xl p-4 max-w-2xl">
        {banner && (
          <div
            className={`mb-3 text-[10px] rounded-lg px-3 py-2 border ${
              banner.kind === 'ok'
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {banner.text}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-bold text-dk text-sm">
              {connected ? status.connected_email : 'Not connected'}
            </div>
            <div className="text-[10px] text-gr mt-0.5">
              {loading
                ? 'Checking connection…'
                : connected
                ? status.last_polled_at
                  ? `Last checked ${formatDate(status.last_polled_at)}${
                      status.last_poll_count != null ? ` · ${status.last_poll_count} new last run` : ''
                    }`
                  : 'Connected — not polled yet'
                : 'Link the systems@ inbox to start auto-filing email.'}
            </div>
          </div>

          <div className="flex gap-2 shrink-0">
            <a
              href={gmailConnectUrl()}
              className="text-xs font-semibold bg-bg border border-lt rounded-lg px-3 py-1.5 text-md hover:bg-pc"
            >
              {connected ? 'Reconnect' : 'Connect Gmail'}
            </a>
            {connected && (
              <button
                onClick={onCheck}
                disabled={polling}
                className="text-xs font-semibold bg-pk text-white rounded-lg px-3 py-1.5 hover:bg-pm disabled:opacity-60"
              >
                {polling ? 'Checking…' : 'Check for new ↻'}
              </button>
            )}
          </div>
        </div>

        {result && (
          <div className="mt-3 text-[10px] text-md bg-bg border border-lt rounded-lg px-3 py-2">
            Scanned {result.scanned} · {result.classified} new classified · {result.skipped} already seen
            {result.extract?.processed != null && ` · ${result.extract.processed} acted on`}
          </div>
        )}
        {error && (
          <div className="mt-3 text-[10px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </div>
    </section>
  );
}
