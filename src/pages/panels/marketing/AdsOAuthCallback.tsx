import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { writeError } from './meta/common';
import { api } from '../../../services/api';
import { payload } from '../../../lib/unwrap';

/**
 * OAuth redirect landing page for ad platforms.
 * The platform sends the user back here with ?code=...&state=platform:accountId;
 * we exchange the code server-side (secrets never touch the browser) and the
 * tokens are merged into the ad account's stored credentials.
 */
const AdsOAuthCallback: React.FC = () => {
  const [status, setStatus] = useState<'working' | 'done' | 'error'>('working');
  const [message, setMessage] = useState('Completing the connection...');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state') ?? '';
    const errParam = params.get('error_description') ?? params.get('error');
    const [platform, accountId] = state.split(':');

    if (errParam) { setStatus('error'); setMessage(`The platform returned an error: ${errParam}`); return; }
    // Central callback shape: the core (api.gc.mw/oauth/callback/ads) already
    // exchanged the code and saved the tokens; it sends us the outcome only.
    if (params.get('done') === '1') {
      const p = params.get('platform') ?? 'the platform';
      setStatus('done');
      setMessage(params.get('configured') === '1'
        ? `${p} is connected. This account now sends and reads live data.`
        : `${p} sign-in saved. Add the account's remaining fields on Ad accounts (Edit) to finish.`);
      return;
    }
    if (!code || !platform || !accountId) {
      setStatus('error'); setMessage('This address is missing the sign-in code. Press Connect on the account again from Ad accounts.');
      return;
    }
    const redirect = `${window.location.origin}/panel/marketing/ads/oauth/callback`;
    api.post(`/marketing-hub/ads/oauth/${platform}/exchange`, {
      account_id: accountId, code, redirect_uri: redirect,
    }).then((r) => {
      setStatus('done');
      setMessage(payload(r).configured
        ? `${platform} is connected. This account now sends and reads live data.`
        : `${platform} sign-in saved. Add the account's remaining fields on Ad accounts (Edit) to finish.`);
    }).catch((e) => {
      setStatus('error');
      setMessage(writeError(e, 'The platform did not accept the sign-in.'));
    });
  }, []);

  return (
    <div className="mx-auto mt-16 max-w-lg rounded-lg border bg-white p-6 text-center shadow-sm sm:p-8">
      <div className="flex justify-center" aria-hidden>
        {status === 'working' ? <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          : status === 'done' ? <CheckCircle2 className="h-8 w-8 text-emerald-600" /> : <AlertTriangle className="h-8 w-8 text-amber-600" />}
      </div>
      <h1 className="mt-2 text-xl font-bold">
        {status === 'working' ? 'Connecting...' : status === 'done' ? 'Account connected' : 'Connection failed'}
      </h1>
      <p className="mt-2 text-sm text-gray-600">{message}</p>
      <Link to="/panel/marketing/ads"
        className="mt-4 inline-block rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
        Back to Ad accounts
      </Link>
    </div>
  );
};

export default AdsOAuthCallback;
