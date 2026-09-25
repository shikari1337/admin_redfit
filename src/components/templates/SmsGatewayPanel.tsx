import React, { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, XCircle, Plug, Save, Undo2, Wand2, AlertTriangle } from 'lucide-react';
import { smsConfigAPI } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Chip } from '@/components/erp/StatusChip';
import InfoTip from '@/components/common/InfoTip';
import { useToast } from '@/hooks/use-toast';

/**
 * The SMS GATEWAY — the store's own SMSAlert (DLT) credentials, a connection
 * test, and the DLT auto-map. Moved here verbatim from the old Notification
 * Templates page when that page became the message catalogue: the wording of a
 * message is the catalogue's business, the pipe it goes out through is this.
 *
 * Deliberately does NOT test the connection on open — that POSTs to the
 * provider and spends a real API call on every visit.
 */
interface SmsConfigMode { baseUrl: string; route: string; senderId: string; apiKey: string; apiKeySet: boolean }
interface SmsConfigForm { isEnabled: boolean; test: SmsConfigMode; live: SmsConfigMode }
const EMPTY_MODE: SmsConfigMode = { baseUrl: '', route: 'transactional', senderId: '', apiKey: '', apiKeySet: false };

const modeView = (m: any): SmsConfigMode => ({
  baseUrl: m?.baseUrl || '', route: m?.route || 'transactional', senderId: m?.senderId || '',
  apiKey: '', apiKeySet: Boolean(m?.apiKeySet),
});

const SmsGatewayPanel: React.FC<{ canWrite: boolean; onChanged?: () => void }> = ({ canWrite, onChanged }) => {
  const { toast } = useToast();
  const [config, setConfig] = useState<SmsConfigForm>({ isEnabled: false, test: { ...EMPTY_MODE }, live: { ...EMPTY_MODE } });
  const [original, setOriginal] = useState<SmsConfigForm | null>(null);
  const [environment, setEnvironment] = useState<'test' | 'live'>('test');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [conn, setConn] = useState<{ state: 'unknown' | 'testing' | 'ok' | 'fail'; message?: string }>({ state: 'unknown' });
  const [dltCount, setDltCount] = useState<number | null>(null);
  const [autoMapping, setAutoMapping] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res: any = await smsConfigAPI.get();
        const c = res?.data || res || {};
        const next: SmsConfigForm = { isEnabled: Boolean(c?.isEnabled), test: modeView(c?.test), live: modeView(c?.live) };
        setConfig(next); setOriginal(next);
        setEnvironment(c?.environment === 'live' ? 'live' : 'test');
      } catch (e: any) {
        setErr(e?.response?.data?.message || e?.message || 'Could not read the SMS gateway settings.');
      } finally { setLoading(false); }
    })();
  }, []);

  const loadDlt = async () => {
    const r: any = await smsConfigAPI.getProviderTemplates();
    setDltCount(r?.ok ? r.templates.length : 0);
  };

  const testConnection = async () => {
    setConn({ state: 'testing' });
    const r: any = await smsConfigAPI.test();
    setConn({ state: r?.ok ? 'ok' : 'fail', message: r?.message });
    if (r?.ok) loadDlt();
  };

  const changed = (a: SmsConfigMode, b: SmsConfigMode) =>
    a.baseUrl !== b.baseUrl || a.route !== b.route || a.senderId !== b.senderId || Boolean(b.apiKey.trim());
  const dirty = !!original && (original.isEnabled !== config.isEnabled || changed(original.test, config.test) || changed(original.live, config.live));

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const out = (m: SmsConfigMode) => ({ baseUrl: m.baseUrl, route: m.route, senderId: m.senderId, apiKey: m.apiKey.trim() ? m.apiKey.trim() : undefined });
      const res: any = await smsConfigAPI.update({ isEnabled: config.isEnabled, test: out(config.test), live: out(config.live) } as any);
      const u = res?.data || res || {};
      const next: SmsConfigForm = { isEnabled: Boolean(u.isEnabled), test: modeView(u.test), live: modeView(u.live) };
      setConfig(next); setOriginal(next);
      toast({ title: 'Gateway saved', description: 'Checking the connection with the saved key…' });
      testConnection();
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || 'Could not save the gateway settings.');
    } finally { setSaving(false); }
  };

  const autoMap = async () => {
    setAutoMapping(true); setErr(null);
    try {
      const r: any = await smsConfigAPI.applyAutoMap();
      if (!r?.ok) { setErr(r?.message || 'Auto-map failed'); return; }
      toast({ title: 'DLT texts matched', description: r.message });
      onChanged?.();
    } finally { setAutoMapping(false); }
  };

  const setMode = (mode: 'test' | 'live', field: keyof SmsConfigMode, value: string) =>
    setConfig((p) => ({ ...p, [mode]: { ...p[mode], [field]: value } }));

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-ink-mute" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={environment === 'live' ? 'green' : 'amber'}>Store is in {environment === 'live' ? 'LIVE' : 'TEST'} mode</Chip>
        <Chip tone={config.isEnabled ? 'green' : 'neutral'}>{config.isEnabled ? 'Sending on' : 'Sending off'}</Chip>
        {conn.state === 'ok' && <span className="inline-flex items-center gap-1 text-xs text-good-ink"><CheckCircle2 className="h-3.5 w-3.5" /> {conn.message}</span>}
        {conn.state === 'fail' && <span className="inline-flex items-center gap-1 text-xs text-bad-ink"><XCircle className="h-3.5 w-3.5" /> {conn.message}</span>}
        <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={testConnection} disabled={conn.state === 'testing'}>
          {conn.state === 'testing' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plug className="mr-1.5 h-3.5 w-3.5" />} Test connection
        </Button>
      </div>
      <p className="text-xs text-ink-soft">
        The platform sets which mode the store is in. Fill the pair that matches it; the other stays saved for when the mode switches.
      </p>

      {(['live', 'test'] as const).map((mode) => (
        <div key={mode} className="space-y-3 rounded-lg border border-line bg-surface-2 p-4">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold uppercase tracking-wide text-ink">{mode}</p>
            {mode === environment && <Chip tone="blue">Active</Chip>}
            <span className="text-[11px] text-ink-soft">{config[mode].apiKeySet && config[mode].senderId ? 'Configured' : 'Not configured'}</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Base URL <InfoTip text="Base only — the endpoint is added for you." /></span>
              <Input type="url" value={config[mode].baseUrl} placeholder="https://www.smsalert.co.in/api" disabled={!canWrite}
                onChange={(e) => setMode(mode, 'baseUrl', e.target.value)} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Route</span>
              <Input value={config[mode].route} placeholder="transactional" disabled={!canWrite}
                onChange={(e) => setMode(mode, 'route', e.target.value)} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Sender ID <InfoTip text="Six letters, approved on your gateway account (your DLT header)." /></span>
              <Input value={config[mode].senderId} maxLength={6} className="uppercase" placeholder="GRWCRD" disabled={!canWrite}
                onChange={(e) => setMode(mode, 'senderId', e.target.value.toUpperCase())} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">API key</span>
              <Input type="password" value={config[mode].apiKey} disabled={!canWrite}
                placeholder={config[mode].apiKeySet ? 'Saved — leave blank to keep' : 'Enter API key'}
                onChange={(e) => setMode(mode, 'apiKey', e.target.value)} />
            </label>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <Checkbox checked={config.isEnabled} disabled={!canWrite} onCheckedChange={(c) => setConfig((p) => ({ ...p, isEnabled: c === true }))} />
          Send SMS
        </label>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={!dirty}
            onClick={() => original && setConfig({ ...original, test: { ...original.test, apiKey: '' }, live: { ...original.live, apiKey: '' } })}>
            <Undo2 className="mr-1.5 h-3.5 w-3.5" /> Reset
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={!canWrite || !dirty || saving}>
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />} Save gateway
          </Button>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-line p-4">
        <p className="text-sm font-semibold text-ink">DLT registered texts {dltCount !== null && <span className="font-normal text-ink-soft">({dltCount})</span>}</p>
        <p className="text-xs text-ink-soft">
          Indian operators refuse any SMS that is not a character-for-character match of a text registered on your account.
          Auto-map matches each message to its registered text; review the result in each message's SMS tab.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={loadDlt}>Load list</Button>
          <Button type="button" size="sm" variant="outline" onClick={autoMap} disabled={!canWrite || autoMapping || !dltCount}>
            {autoMapping ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1.5 h-3.5 w-3.5" />} Auto-map
          </Button>
        </div>
        {dltCount === 0 && (
          <p className="inline-flex items-center gap-1 text-xs text-warn-ink"><AlertTriangle className="h-3.5 w-3.5" /> No registered texts loaded — test the connection first.</p>
        )}
      </div>

      {err && <div className="rounded-md border border-bad bg-bad-bg px-3 py-2 text-sm text-bad-ink">{err}</div>}
    </div>
  );
};

export default SmsGatewayPanel;
