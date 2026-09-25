/**
 * "Continue with Growcord ID" — the store admin's half of the dual run.
 *
 * SELF-CONTAINED ON PURPOSE. One element with its own divider and its own error
 * line, so the sign-in page adds it in a single line and a redesign of that page
 * never has to understand OIDC. It renders NOTHING when
 * `VITE_GROWCORD_ID_ISSUER` is unset — which is every build until one is
 * deployed with it — and the password form beside it is untouched either way.
 *
 * It is the INTERACTIVE path. Most people will never see it: the silent check
 * in `AuthContext` signs them in before this page renders when they already
 * have a Growcord ID session on another gc.mw host (docs/UI_PLAN.md §6). This
 * is for the first sign-in of the day, and for a person whose silent check came
 * back `login_required`.
 */
import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { ADMIN_PRODUCT, growcordIdConfig, startSignIn, takeGrowcordIdError } from '../utils/growcordId';

export default function GrowcordIdButton({ returnTo = '/' }: { returnTo?: string }) {
  const config = growcordIdConfig(ADMIN_PRODUCT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // A sign-in that failed on the callback path bounced the browser back here
  // with its reason in session storage. Show it once, then forget it — a
  // person sent back to a form with no explanation has nothing to act on.
  useEffect(() => {
    const previous = takeGrowcordIdError();
    if (previous) setError(previous);
  }, []);
  if (!config) return null;

  const go = async () => {
    setBusy(true);
    setError('');
    try {
      await startSignIn({
        issuer: config.issuer,
        clientId: config.clientId,
        redirectUri: config.redirectUri,
        scope: config.scope,
        // No `org` is named: one admin build serves every store and the
        // HOSTNAME decides which (#211). A person who belongs to more than one
        // organisation is asked on the hosted page, which is the right place
        // for that question.
        returnTo,
      });
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-2 text-xs text-gray-400">or</span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void go()}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-gray-300 text-gray-800 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {busy
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Opening Growcord ID…</>
          : <><ShieldCheck className="h-4 w-4" /> Continue with Growcord ID</>}
      </button>
      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}
      <p className="text-[11px] text-gray-500 text-center m-0">
        One account across every Growcord product. Sign in once and every panel opens already signed in.
      </p>
    </div>
  );
}
