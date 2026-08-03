import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../services/api';
import { payload } from '../../../lib/unwrap';

/**
 * OAuth landing page for the connector platform.
 *
 * The provider returns ?code=…&state=… . The state is an opaque single-use
 * token minted server-side, so this page does not (and cannot) know which
 * provider it belongs to beyond the `provider` query param we round-trip — the
 * backend re-derives everything from the stored state row and rejects replays.
 *
 * The code is exchanged SERVER-SIDE: no client id, secret or token ever exists
 * in the browser.
 */
const ConnectorCallback: React.FC = () => {
  const [status, setStatus] = useState<'working' | 'done' | 'error'>('working');
  const [message, setMessage] = useState('Completing the connection…');
  const [services, setServices] = useState<string[]>([]);
  // React 18 StrictMode double-invokes effects in dev; the state token is
  // single-use, so a second exchange would fail. Guard it.
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state') ?? '';
    const errParam = params.get('error_description') ?? params.get('error');
    const provider = params.get('provider') ?? 'google';

    if (errParam) {
      setStatus('error');
      setMessage(
        errParam === 'access_denied'
          ? 'You declined the permission request, so nothing was connected.'
          : `The provider returned an error: ${errParam}`);
      return;
    }
    if (!code || !state) {
      setStatus('error');
      setMessage('The callback URL is missing its code or state. Start the connection again from Platform Connections.');
      return;
    }

    api.post(`/connectors/${provider}/callback`, { state, code })
      .then((r) => {
        const data = payload<any>(r);
        setStatus('done');
        setServices(data?.services ?? []);
        setMessage(
          data?.accountEmail
            ? `Connected as ${data.accountEmail}.`
            : 'Connected successfully.');
      })
      .catch((e) => {
        setStatus('error');
        setMessage(e?.response?.data?.message ?? e.message);
      });
  }, []);

  const back = sessionStorage.getItem('connector_return') || '/panel/marketing/connections';

  return (
    <div className="mx-auto mt-16 max-w-lg rounded-lg border bg-white p-8 text-center shadow-sm">
      <div className="text-3xl">{status === 'working' ? '⏳' : status === 'done' ? '✅' : '⚠️'}</div>
      <h1 className="mt-2 text-xl font-bold">
        {status === 'working' ? 'Connecting…' : status === 'done' ? 'Connected' : 'Connection failed'}
      </h1>
      <p className="mt-2 text-sm text-gray-600">{message}</p>

      {status === 'done' && services.length > 0 && (
        <p className="mt-3 text-sm text-gray-600">
          Next: choose the property or account for{' '}
          <strong>{services.map((s) => s.replace(/_/g, ' ')).join(', ')}</strong> on the connections page.
        </p>
      )}

      <Link to={back}
        className="mt-5 inline-block rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
        Back to Platform Connections
      </Link>
    </div>
  );
};

export default ConnectorCallback;
