import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../services/api';
import { payload } from '../../../lib/unwrap';

/**
 * OAuth redirect landing page for ad platforms.
 * The platform sends the user back here with ?code=…&state=platform:accountId;
 * we exchange the code server-side (secrets never touch the browser) and the
 * tokens are merged into the ad account's stored credentials.
 */
const AdsOAuthCallback: React.FC = () => {
  const [status, setStatus] = useState<'working' | 'done' | 'error'>('working');
  const [message, setMessage] = useState('Completing the connection…');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state') ?? '';
    const errParam = params.get('error_description') ?? params.get('error');
    const [platform, accountId] = state.split(':');

    if (errParam) { setStatus('error'); setMessage(`The platform returned an error: ${errParam}`); return; }
    if (!code || !platform || !accountId) {
      setStatus('error'); setMessage('Missing code/state in the callback URL — start the Connect flow again from the Ads Manager.');
      return;
    }
    const redirect = `${window.location.origin}/panel/marketing/ads/oauth/callback`;
    api.post(`/marketing-hub/ads/oauth/${platform}/exchange`, {
      account_id: accountId, code, redirect_uri: redirect,
    }).then((r) => {
      setStatus('done');
      setMessage(payload(r).configured
        ? `Connected! ${platform} tokens saved — live sync is now active for this account.`
        : `Tokens saved. Add the remaining ${platform} credentials (see the account form) to go fully live.`);
    }).catch((e) => {
      setStatus('error');
      setMessage(e?.response?.data?.message ?? e.message);
    });
  }, []);

  return (
    <div className="mx-auto mt-16 max-w-lg rounded-lg border bg-white p-8 text-center shadow-sm">
      <div className="text-3xl">{status === 'working' ? '⏳' : status === 'done' ? '✅' : '⚠️'}</div>
      <h1 className="mt-2 text-xl font-bold">
        {status === 'working' ? 'Connecting…' : status === 'done' ? 'Account connected' : 'Connection failed'}
      </h1>
      <p className="mt-2 text-sm text-gray-600">{message}</p>
      <Link to="/panel/marketing/ads"
        className="mt-4 inline-block rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
        Back to Ads Manager
      </Link>
    </div>
  );
};

export default AdsOAuthCallback;
