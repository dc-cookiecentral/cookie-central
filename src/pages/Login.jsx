import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

// Two sign-in methods: magic link (default for normal use) and password
// (fallback for demo + when email delivery is rate-limited). Password mode
// requires a user pre-provisioned in the Supabase dashboard with a password
// set and "Auto-confirm" ticked.

export default function Login() {
  const { signInWithEmail, signInWithPassword } = useAuth();
  const [mode, setMode] = useState('magic'); // 'magic' | 'password'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setStatus('sending');
    setError(null);
    const id = email.trim().toLowerCase();
    const { error } =
      mode === 'magic'
        ? await signInWithEmail(id)
        : await signInWithPassword(id, password);
    if (error) {
      setStatus('idle');
      setError(error.message);
    } else {
      setStatus(mode === 'magic' ? 'sent' : 'idle');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-6">
      <div className="bg-cd w-full max-w-sm rounded-xl border border-lt p-8 shadow-sm">
        <div className="text-2xl font-black italic text-pk mb-1">cookie central</div>
        <div className="text-[10px] uppercase tracking-wider text-gr mb-4">Walmart + Kroger</div>

        <div className="flex gap-1 mb-4">
          {[
            { k: 'magic', l: 'Magic link' },
            { k: 'password', l: 'Password' },
          ].map((m) => (
            <button
              key={m.k}
              onClick={() => {
                setMode(m.k);
                setStatus('idle');
                setError(null);
              }}
              className={[
                'flex-1 text-[10px] font-semibold py-1.5 rounded-md border',
                mode === m.k ? 'border-pk bg-pink-50 text-pk' : 'border-lt bg-cd text-gr hover:text-pk',
              ].join(' ')}
            >
              {m.l}
            </button>
          ))}
        </div>

        {status === 'sent' ? (
          <div className="text-sm text-md">
            Check <span className="font-semibold">{email}</span> for a magic link.
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-xs font-semibold uppercase text-gr">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@dirtycookie.com"
              className="w-full rounded-lg border border-lt px-3 py-2 text-sm focus:outline-none focus:border-pk"
            />
            {mode === 'password' && (
              <>
                <label className="block text-xs font-semibold uppercase text-gr">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Set in Supabase dashboard"
                  className="w-full rounded-lg border border-lt px-3 py-2 text-sm focus:outline-none focus:border-pk"
                />
              </>
            )}
            <button
              type="submit"
              disabled={status === 'sending'}
              className="w-full rounded-lg bg-pk text-white text-sm font-semibold py-2 hover:bg-pm disabled:opacity-50"
            >
              {status === 'sending'
                ? 'Signing in…'
                : mode === 'magic'
                ? 'Send magic link'
                : 'Sign in'}
            </button>
            {error && <div className="text-xs text-red-600">{error}</div>}
            {mode === 'password' && (
              <div className="text-[10px] text-gr italic">
                Password sign-in needs a user pre-provisioned in Supabase
                Auth with a password set + "Auto-confirm" enabled.
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
