/**
 * Settings tools — the two things the Settings Center genuinely cannot do.
 *
 * This page used to be a 490-line hand-written grid of every settings screen: a
 * THIRD list of pages beside the sidebar and the registry's own `SETTINGS_PAGES`
 * (L5 §5), kept by hand and already out of date. That grid is gone — Settings ▸
 * Pages & tools in the Center is generated from the registry and cannot drift.
 *
 * What is left is what does not belong to the registry at all:
 *  · the store API key, which is written to THIS BROWSER, not to the store;
 *  · clearing the storefront's cache, which is a request to the website.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStoreSiteUrl } from '../lib/storefront';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Key, RefreshCw, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';
import { getTenantApiKey, setTenantApiKey } from '@/services/api';

const Settings: React.FC = () => {
  /** This store's own website — from the server, per store (lib/storefront.ts). */
  const siteUrl = useStoreSiteUrl();
  const [tenantApiKeyInput, setTenantApiKeyInput] = useState('');
  const [tenantApiKeySet, setTenantApiKeySet] = useState(false);
  const [tenantApiKeySaved, setTenantApiKeySaved] = useState(false);
  const [cacheStatus, setCacheStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [cacheMessage, setCacheMessage] = useState('');

  useEffect(() => { setTenantApiKeySet(!!getTenantApiKey()); }, []);

  const handleSaveTenantApiKey = () => {
    const value = tenantApiKeyInput.trim();
    setTenantApiKey(value);
    setTenantApiKeyInput('');
    setTenantApiKeySet(!!value);
    setTenantApiKeySaved(true);
    setTimeout(() => setTenantApiKeySaved(false), 3000);
  };

  const handleClearTenantApiKey = () => {
    setTenantApiKey(null);
    setTenantApiKeyInput('');
    setTenantApiKeySet(false);
  };

  const handleClearCache = async (path?: string) => {
    setCacheStatus('loading');
    setCacheMessage('');
    // No resolvable website means there is no cache to clear — say so, rather
    // than POSTing to localhost as this used to.
    if (!siteUrl) {
      setCacheStatus('error');
      setCacheMessage('This store has no website address on record, so there is no cache to clear.');
      return;
    }
    try {
      const res = await fetch(`${siteUrl}/api/revalidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      const data = await res.json();
      if (res.ok && data.revalidated) {
        setCacheStatus('success');
        setCacheMessage(path ? `Refreshed ${path}.` : 'Refreshed the whole website.');
      } else {
        setCacheStatus('error');
        setCacheMessage(data?.message ?? 'The website did not accept the request.');
      }
    } catch {
      setCacheStatus('error');
      setCacheMessage('Could not reach the website.');
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Tools</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Two things that belong to this browser and to the website, not to the store's settings.
        </p>
      </header>

      <Link
        to="/settings"
        className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-soft hover:bg-surface-2"
      >
        <span className="flex-1">Looking for a setting? Every one of them is in Settings, searchable by name or number.</span>
        <ArrowRight className="size-4 shrink-0 text-ink-mute" />
      </Link>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-2">
              <Key className="size-5 text-ink-mute" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-medium text-ink">Store key for this browser</h2>
              <p className="mt-0.5 text-sm text-ink-soft">
                Sent as <code className="rounded bg-surface-2 px-1">x-api-key</code> so the server knows which store
                you mean when this admin is not on the store's own domain. It is saved in this browser only.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="password"
              placeholder="rf_…"
              value={tenantApiKeyInput}
              onChange={(e) => setTenantApiKeyInput(e.target.value)}
              className="max-w-md"
            />
            <div className="flex gap-2">
              <Button onClick={handleSaveTenantApiKey} disabled={!tenantApiKeyInput.trim()}>Save</Button>
              <Button variant="outline" onClick={handleClearTenantApiKey}>Clear</Button>
            </div>
          </div>
          {tenantApiKeySet && <p className="text-sm text-ink-soft">A key is set. Every request carries it.</p>}
          {tenantApiKeySaved && <p className="text-sm text-good">Saved.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-2">
              <RefreshCw className="size-5 text-ink-mute" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-medium text-ink">Refresh the website</h2>
              <p className="mt-0.5 text-sm text-ink-soft">
                The shop caches its pages. Use this when a change you made in here has not appeared yet.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => handleClearCache()} disabled={cacheStatus === 'loading'}>
              Refresh everything
            </Button>
            <Button variant="outline" onClick={() => handleClearCache('/')} disabled={cacheStatus === 'loading'}>
              Refresh the home page
            </Button>
          </div>
          {cacheStatus === 'success' && (
            <p className="flex items-center gap-2 text-sm text-good"><CheckCircle className="size-4" />{cacheMessage}</p>
          )}
          {cacheStatus === 'error' && (
            <p className="flex items-center gap-2 text-sm text-bad"><AlertCircle className="size-4" />{cacheMessage}</p>
          )}
          <p className="text-xs text-ink-mute">
            Website: <code className="rounded bg-surface-2 px-1">{siteUrl ?? 'not set'}</code> — this store's own
            address, from its domain settings.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
