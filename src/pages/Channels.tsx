import { useEffect, useState } from 'react';
import { channelsAPI } from '../services/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';
import {
  Plug, RefreshCw, Trash2, Settings2, Rss, CheckCircle2, XCircle, Link2, ExternalLink, ClipboardList, Upload,
} from 'lucide-react';

interface FieldDef { key: string; label: string; type: string; required?: boolean; secret?: boolean; default?: string; options?: string[]; }
interface Platform {
  code: string; name: string; platform_type: 'marketplace' | 'listing' | 'social' | 'offline' | 'online';
  icon_url?: string; api_docs_url?: string;
  config_schema: { fields?: FieldDef[]; capabilities?: Record<string, boolean>; note?: string; adapter?: string; native?: boolean };
}
interface Connection {
  id: string; platform_code: string; display_name?: string;
  credentials: Record<string, { set: boolean; preview: string }>;
  config: Record<string, any>; is_active: boolean;
  sync_inventory: boolean; sync_listings: boolean; sync_orders: boolean;
  inventory_buffer_pct: number; push_schedule?: string; pull_schedule?: string;
  last_push_at?: string; last_error?: string; feed_url?: string | null;
}

const TYPE_BADGE: Record<string, string> = {
  marketplace: 'bg-blue-100 text-blue-700',
  listing: 'bg-green-100 text-green-700',
  social: 'bg-purple-100 text-purple-700',
  online: 'bg-indigo-100 text-indigo-700',
  offline: 'bg-amber-100 text-amber-800',
};
const typeBadge = (t: string) => TYPE_BADGE[t] || 'bg-gray-100 text-gray-700';
const initials = (n: string) => n.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const isCatalog = (code: string) => ['google_shopping', 'facebook_catalog', 'whatsapp_catalog'].includes(code);

// NATIVE channels have no external API and none is wanted — the online store
// (its stock IS the pool), the offline/manual channel, and owner-created custom
// channels. Mirrors services/channels/registry.ts isNativePlatform: they are
// never pushed and never tested, so offering "Test" / "Sync now" here only ever
// produced a failure for a channel that is working exactly as designed.
const NATIVE_CODES = ['online_store', 'offline', 'custom'];
const isNative = (code: string, config?: Record<string, any>, schema?: Platform['config_schema']) =>
  NATIVE_CODES.includes(code) || schema?.native === true || config?.native === true || config?.custom === true;
const NATIVE_HELP: Record<string, string> = {
  online_store: 'Your own website — already selling. Nothing syncs: its stock is the shared pool and its orders are in Orders.',
  offline: 'No API to sync. Record its sales with Manual Order and its stock with a ledgered adjustment — both attribute here.',
  custom: 'No API to sync. Upload this channel’s stock or order file from Channels ▸ Import.',
};
const nativeHelp = (code: string) => NATIVE_HELP[code] ?? NATIVE_HELP.custom;

export default function Channels() {
  const { toast } = useToast();
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogPlatform, setDialogPlatform] = useState<Platform | null>(null);
  const [editing, setEditing] = useState<Connection | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [p, c, l] = await Promise.all([
      channelsAPI.getPlatforms(), channelsAPI.getConnections(), channelsAPI.getLogs({ limit: 50 }),
    ]);
    setPlatforms(p); setConnections(c); setLogs(l); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const connFor = (code: string) => connections.find((c) => c.platform_code === code);

  const openConfigure = (platform: Platform, conn?: Connection) => {
    setDialogPlatform(platform);
    setEditing(conn ?? null);
    // A native channel never pushes, so it is created with the sync flags OFF
    // and no schedule — the row then says what it actually does.
    const native = isNative(platform.code, conn?.config, platform.config_schema);
    const base: Record<string, any> = {
      display_name: conn?.display_name ?? platform.name,
      sync_inventory: conn?.sync_inventory ?? !native,
      sync_listings: conn?.sync_listings ?? (!native && isCatalog(platform.code)),
      sync_orders: conn?.sync_orders ?? false,
      inventory_buffer_pct: conn?.inventory_buffer_pct ?? 0,
      push_schedule: conn?.push_schedule ?? (native ? '' : '*/15 * * * *'),
      pull_schedule: conn?.pull_schedule ?? (native ? '' : '*/30 * * * *'),
    };
    for (const f of platform.config_schema.fields ?? []) {
      base[f.key] = f.secret ? '' : (conn?.config?.[f.key] ?? f.default ?? '');
    }
    setForm(base);
  };

  const save = async () => {
    if (!dialogPlatform) return;
    setSaving(true);
    try {
      const fields: Record<string, any> = {};
      for (const f of dialogPlatform.config_schema.fields ?? []) {
        // Skip empty secret fields on edit → keeps the stored value
        if (f.secret && (form[f.key] === '' || form[f.key] === undefined)) continue;
        fields[f.key] = form[f.key];
      }
      const payload = {
        platform_code: dialogPlatform.code,
        display_name: form.display_name,
        fields,
        sync_inventory: form.sync_inventory,
        sync_listings: form.sync_listings,
        sync_orders: form.sync_orders,
        inventory_buffer_pct: Number(form.inventory_buffer_pct) || 0,
        push_schedule: form.push_schedule,
        pull_schedule: form.pull_schedule,
      };
      if (editing) await channelsAPI.updateConnection(editing.id, payload);
      else await channelsAPI.createConnection(payload);
      toast({ title: editing ? 'Channel updated' : 'Channel connected' });
      setDialogPlatform(null); setEditing(null);
      await load();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.response?.data?.message || e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const test = async (conn: Connection) => {
    const res = await channelsAPI.testConnection(conn.id);
    toast({
      title: res?.ok ? 'Connection OK' : 'Connection failed',
      description: res?.message,
      variant: res?.ok ? undefined : 'destructive',
    });
  };
  const sync = async (conn: Connection) => {
    toast({ title: 'Sync started', description: 'Pushing current stock to the channel…' });
    const res = await channelsAPI.syncNow(conn.id);
    if (res) {
      toast({ title: 'Sync complete', description: `${res.ok}/${res.total} items OK, ${res.error} errors` });
    } else {
      // The engine returns nothing whenever it deliberately skips a push. That
      // used to surface as SILENCE — the button looked dead, so people clicked
      // it again (visible as paired entries in the activity log). Say why.
      const reason = isNative(conn.platform_code, conn.config)
        ? nativeHelp(conn.platform_code)
        : (isCatalog(conn.platform_code) && (conn.config?.connect_method ?? 'feed') === 'feed')
          ? 'This channel pulls your hosted feed URL on its own schedule — there is nothing to push from here.'
          : !conn.is_active
            ? 'This channel is paused. Turn it back on in Configure.'
            : 'No SKUs are mapped to this channel yet, or inventory sync is off for it. Check SKU Mapping.';
      toast({ title: 'Nothing to push', description: reason });
    }
    await load();
  };
  const remove = async (conn: Connection) => {
    if (!confirm(`Disconnect ${conn.platform_code}? Mappings for this channel will be removed.`)) return;
    await channelsAPI.deleteConnection(conn.id);
    toast({ title: 'Channel disconnected' });
    await load();
  };
  // Copies the EXISTING feed URL without touching the token — only mints a new
  // one the first time (no token yet). Re-clicking this to re-copy the link
  // must never invalidate a URL already registered in Merchant Center / Commerce
  // Manager; that used to happen because this always rotated the token.
  const getFeed = async (conn: Connection) => {
    if (conn.feed_url) {
      await navigator.clipboard.writeText(conn.feed_url).catch(() => {});
      toast({ title: 'Feed URL copied', description: conn.feed_url });
      return;
    }
    const res = await channelsAPI.rotateFeedToken(conn.id);
    if (res?.feed_url) {
      await navigator.clipboard.writeText(res.feed_url).catch(() => {});
      toast({ title: 'Feed URL copied', description: res.feed_url });
      await load();
    }
  };
  // Explicit, separate action for actually invalidating the old URL.
  const rotateFeed = async (conn: Connection) => {
    if (!confirm('Generate a NEW feed URL? The current one — if already added in Google Merchant Center or Meta Commerce Manager — will start returning 404 until you replace it there too.')) return;
    const res = await channelsAPI.rotateFeedToken(conn.id);
    if (res?.feed_url) {
      await navigator.clipboard.writeText(res.feed_url).catch(() => {});
      toast({ title: 'New feed URL copied', description: 'Update this in Merchant Center / Commerce Manager too.' });
      await load();
    }
  };

  const enabledCount = connections.filter((c) => c.is_active).length;
  const ownChannels = connections.filter((c) => !platforms.some((p) => p.code === c.platform_code));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Plug className="h-6 w-6" /> Multi-Channel Sync</h1>
          <p className="text-sm text-muted-foreground">Sync inventory & listings to marketplaces and catalog channels. {enabledCount} active.</p>
        </div>
        <Button asChild variant="outline"><Link to="/channels/mapping"><Link2 className="h-4 w-4 mr-2" /> SKU Mapping</Link></Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading channels…</p>
      ) : platforms.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No channels have been enabled by the platform administrator yet. Ask your super admin to enable channels in the platform Channels registry.
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {platforms.map((p) => {
            const conn = connFor(p.code);
            const native = isNative(p.code, conn?.config, p.config_schema);
            return (
              <Card key={p.code} className="overflow-hidden">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center font-semibold text-gray-600">
                        {p.icon_url ? <img src={p.icon_url} alt="" className="h-6 w-6" /> : initials(p.name)}
                      </div>
                      <div>
                        <div className="font-medium">{p.name}</div>
                        <span className={`text-xs px-2 py-0.5 rounded ${typeBadge(p.platform_type)}`}>{p.platform_type}</span>
                      </div>
                    </div>
                    {conn && (conn.is_active
                      ? <Badge className="bg-green-100 text-green-700">Connected</Badge>
                      : <Badge variant="secondary">Paused</Badge>)}
                  </div>

                  {conn ? (
                    <>
                      <div className="text-xs text-muted-foreground space-y-1">
                        {native ? (
                          <div>{nativeHelp(p.code)}</div>
                        ) : (
                          <>
                            <div>Sync: {[conn.sync_inventory && 'Inventory', conn.sync_listings && 'Listings', conn.sync_orders && 'Orders'].filter(Boolean).join(', ') || 'none'}</div>
                            {conn.inventory_buffer_pct > 0 && <div>Safety buffer: {conn.inventory_buffer_pct}%</div>}
                            {conn.last_push_at && <div>Last push: {new Date(conn.last_push_at).toLocaleString()}</div>}
                            {conn.last_error && <div className="text-red-600 flex items-center gap-1"><XCircle className="h-3 w-3" /> {conn.last_error}</div>}
                          </>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button size="sm" variant="outline" onClick={() => openConfigure(p, conn)}><Settings2 className="h-3.5 w-3.5 mr-1" /> Configure</Button>
                        {/* Test / Sync now are meaningless on a native channel — there is
                            no endpoint behind them. They used to report a failure for a
                            channel that was working exactly as designed. */}
                        {!native && <Button size="sm" variant="outline" onClick={() => test(conn)}><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Test</Button>}
                        {!native && <Button size="sm" variant="outline" onClick={() => sync(conn)}><RefreshCw className="h-3.5 w-3.5 mr-1" /> Sync now</Button>}
                        {native && p.code !== 'online_store' &&
                          <Button size="sm" variant="outline" asChild><Link to="/channels/import"><Upload className="h-3.5 w-3.5 mr-1" /> Import file</Link></Button>}
                        {!native && (isCatalog(p.code) || p.config_schema.capabilities?.feed) &&
                          <Button size="sm" variant="outline" onClick={() => getFeed(conn)}><Rss className="h-3.5 w-3.5 mr-1" /> Feed URL</Button>}
                        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(conn)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                      {!native && conn.feed_url && (
                        <div className="text-xs bg-gray-50 rounded p-2 border space-y-1">
                          <div className="break-all">{conn.feed_url}</div>
                          <button
                            type="button"
                            onClick={() => rotateFeed(conn)}
                            className="text-red-600 hover:underline"
                          >
                            Regenerate (breaks the URL above)
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="space-y-2 pt-1">
                      {native && <p className="text-xs text-muted-foreground">{nativeHelp(p.code)}</p>}
                      <div className="flex items-center justify-between">
                        {p.api_docs_url
                          ? <a href={p.api_docs_url} target="_blank" rel="noreferrer" className="text-xs text-primary flex items-center gap-1">Docs <ExternalLink className="h-3 w-3" /></a>
                          : <span />}
                        <Button size="sm" onClick={() => openConfigure(p)}>
                          <Plug className="h-3.5 w-3.5 mr-1" /> {native ? 'Add channel' : 'Connect'}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Channels the owner created themselves (Channels ▸ Import) have no
          registry platform, so the grid above could never show them — they were
          invisible everywhere except the import wizard's dropdown. */}
      {ownChannels.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-medium text-sm text-muted-foreground">Your own channels</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {ownChannels.map((conn) => (
              <Card key={conn.id}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center font-semibold text-gray-600">
                        {initials(conn.display_name || conn.platform_code)}
                      </div>
                      <div>
                        <div className="font-medium">{conn.display_name || conn.platform_code}</div>
                        <span className={`text-xs px-2 py-0.5 rounded ${typeBadge('offline')}`}>custom</span>
                      </div>
                    </div>
                    {conn.is_active ? <Badge className="bg-green-100 text-green-700">Active</Badge> : <Badge variant="secondary">Paused</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">{nativeHelp('custom')}</div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="outline" asChild><Link to="/channels/import"><Upload className="h-3.5 w-3.5 mr-1" /> Import file</Link></Button>
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(conn)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Recent sync activity */}
      <Card>
        <CardContent className="p-5">
          <h2 className="font-medium flex items-center gap-2 mb-3"><ClipboardList className="h-4 w-4" /> Recent Sync Activity</h2>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sync runs yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b">
                  <tr><th className="py-2 pr-4">When</th><th className="pr-4">Channel</th><th className="pr-4">Direction</th><th className="pr-4">Status</th><th className="pr-4">OK / Total</th><th>Errors</th></tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</td>
                      <td className="pr-4">{l.platform_code}</td>
                      <td className="pr-4">{l.direction}</td>
                      <td className="pr-4">
                        <span className={`px-2 py-0.5 rounded text-xs ${l.status === 'success' ? 'bg-green-100 text-green-700' : l.status === 'partial' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{l.status}</span>
                      </td>
                      <td className="pr-4">{l.items_ok}/{l.items_total}</td>
                      <td className="text-red-600">{l.items_error || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configure dialog */}
      <Dialog open={!!dialogPlatform} onOpenChange={(o) => { if (!o) { setDialogPlatform(null); setEditing(null); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Configure' : 'Connect'} {dialogPlatform?.name}</DialogTitle>
          </DialogHeader>
          {dialogPlatform && (
            <div className="space-y-4">
              {dialogPlatform.config_schema.note && (
                <p className="text-xs bg-amber-50 text-amber-800 rounded p-2 border border-amber-200">{dialogPlatform.config_schema.note}</p>
              )}
              <div>
                <Label>Display name</Label>
                <Input value={form.display_name || ''} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
              </div>

              {(dialogPlatform.config_schema.fields ?? []).map((f) => (
                <div key={f.key}>
                  <Label>{f.label}{f.required && <span className="text-red-500"> *</span>}</Label>
                  {f.type === 'select' ? (
                    <Select value={form[f.key] ?? ''} onValueChange={(v) => setForm({ ...form, [f.key]: v })}>
                      <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent>
                        {(f.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type={f.secret ? 'password' : 'text'}
                      value={form[f.key] ?? ''}
                      placeholder={f.secret && editing?.credentials?.[f.key]?.set ? `•••• ${editing.credentials[f.key].preview} (leave blank to keep)` : ''}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    />
                  )}
                </div>
              ))}

              {/* A native channel has nothing to sync, no oversell risk to buffer
                  against and no schedule to run — showing those controls only
                  implied a sync that never happens. */}
              {!isNative(dialogPlatform.code, editing?.config, dialogPlatform.config_schema) && (
                <>
                  <div className="grid grid-cols-3 gap-3 pt-1">
                    <label className="flex items-center gap-2 text-sm"><Switch checked={!!form.sync_inventory} onCheckedChange={(v) => setForm({ ...form, sync_inventory: v })} /> Inventory</label>
                    <label className="flex items-center gap-2 text-sm"><Switch checked={!!form.sync_listings} onCheckedChange={(v) => setForm({ ...form, sync_listings: v })} /> Listings</label>
                    <label className="flex items-center gap-2 text-sm"><Switch checked={!!form.sync_orders} onCheckedChange={(v) => setForm({ ...form, sync_orders: v })} /> Orders</label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Safety buffer %</Label>
                      <Input type="number" min={0} max={100} value={form.inventory_buffer_pct ?? 0} onChange={(e) => setForm({ ...form, inventory_buffer_pct: e.target.value })} />
                      <p className="text-[11px] text-muted-foreground mt-1">Hold back this % of stock from the channel to avoid oversell.</p>
                    </div>
                    <div>
                      <Label>Push schedule (cron)</Label>
                      <Input value={form.push_schedule ?? ''} onChange={(e) => setForm({ ...form, push_schedule: e.target.value })} />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogPlatform(null); setEditing(null); }}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save' : 'Connect'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
