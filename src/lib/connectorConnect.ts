/**
 * The ONE consent flow for a provider connection (Google, Meta): Platform Connections and the
 * Facebook and Instagram page both start it here. The server builds the provider's consent URL; the
 * provider returns to /panel/marketing/connections/callback (ConnectorCallback.tsx), which finishes the
 * exchange server side and links back to `connector_return`.
 */
import { api } from '../services/api';
import { payload } from './unwrap';

/**
 * Start (or extend, when `connectionId` is given) a connection and leave for the consent screen.
 * Answers the server's reason in words when no consent URL came back, or null once the browser is leaving.
 */
export async function startConnect(
  provider: string,
  services: string[],
  connectionId: string | null,
  returnTo: string = window.location.pathname,
): Promise<string | null> {
  const redirectUri = `${window.location.origin}/panel/marketing/connections/callback`;
  const res = await api.post(`/connectors/${provider}/connect`, { services, redirectUri, connectionId: connectionId ?? null });
  const data = payload<any>(res);
  if (!data?.url) return data?.note ?? 'Could not build the consent URL.';
  // Remember where to come back to; the callback page reads this.
  sessionStorage.setItem('connector_return', returnTo);
  window.location.href = data.url;
  return null;
}
