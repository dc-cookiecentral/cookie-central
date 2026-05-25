import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { signInWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setStatus('sending');
    setError(null);
    const { error } = await signInWithEmail(email.trim().toLowerCase());
    if (error) {
      setStatus('idle');
      setError(error.message);
    } else {
      setStatus('sent');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-6">
      <div className="bg-cd w-full max-w-sm rounded-xl border border-lt p-8 shadow-sm">
        <div className="text-2xl font-black italic text-pk mb-1">cookie central</div>
        <div className="text-[10px] uppercase tracking-wider text-gr mb-6">Walmart + Kroger</div>

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
            <button
              type="submit"
              disabled={status === 'sending'}
              className="w-full rounded-lg bg-pk text-white text-sm font-semibold py-2 hover:bg-pm disabled:opacity-50"
            >
              {status === 'sending' ? 'Sending…' : 'Send magic link'}
            </button>
            {error && <div className="text-xs text-red-600">{error}</div>}
          </form>
        )}
      </div>
    </div>
  );
}
