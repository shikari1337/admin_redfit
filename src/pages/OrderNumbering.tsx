import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, RotateCcw, Hash, Building2 } from 'lucide-react';
import { orderNumberingAPI, type OrderNumberingScope } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/**
 * Order numbering settings.
 *
 * Retail/bulk and B2B draw from INDEPENDENT counters, so a store can invoice
 * them separately. The preview is rendered server-side from the same code that
 * allocates real numbers, so what you see here is exactly what the next order
 * gets.
 */

type ScopeKey = 'retail' | 'b2b';

const DEFAULTS: Record<ScopeKey, OrderNumberingScope> = {
  retail: { prefix: 'ORD-', suffix: '', padding: 5, start: 1, reset: 'never', format: '{PREFIX}{SEQ}{SUFFIX}', enabled: true },
  b2b:    { prefix: 'B2B-', suffix: '', padding: 5, start: 1, reset: 'never', format: '{PREFIX}{SEQ}{SUFFIX}', enabled: true },
};

const RESET_LABELS: Record<string, string> = {
  never: 'Never (one continuous series)',
  yearly: 'Every year',
  monthly: 'Every month',
  daily: 'Every day',
};

const SCOPE_META: Record<ScopeKey, { title: string; blurb: string; icon: React.ReactNode }> = {
  retail: {
    title: 'Retail & bulk orders',
    blurb: 'Every normal storefront order, including bulk buys.',
    icon: <Hash className="h-4 w-4" />,
  },
  b2b: {
    title: 'B2B orders',
    blurb: 'Orders from customers marked as B2B for this store — numbered separately.',
    icon: <Building2 className="h-4 w-4" />,
  },
};

const OrderNumbering: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [config, setConfig] = useState<Record<ScopeKey, OrderNumberingScope>>(DEFAULTS);
  const [original, setOriginal] = useState<Record<ScopeKey, OrderNumberingScope> | null>(null);
  const [separateB2b, setSeparateB2b] = useState(true);
  const [originalSeparateB2b, setOriginalSeparateB2b] = useState(true);
  const [preview, setPreview] = useState<Record<ScopeKey, string>>({ retail: '', b2b: '' });
  const [sequences, setSequences] = useState<Array<{ scope: string; period: string; current_value: number }>>([]);
  const [tokens, setTokens] = useState<string[]>([]);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await orderNumberingAPI.get();
      const d = res?.data ?? res;
      const next = {
        retail: { ...DEFAULTS.retail, ...(d?.config?.retail ?? {}) },
        b2b: { ...DEFAULTS.b2b, ...(d?.config?.b2b ?? {}) },
      };
      setConfig(next);
      setOriginal(JSON.parse(JSON.stringify(next)));
      const sep = d?.config?.separateB2bSeries !== false;
      setSeparateB2b(sep);
      setOriginalSeparateB2b(sep);
      setPreview({ retail: d?.preview?.retail ?? '', b2b: d?.preview?.b2b ?? '' });
      setSequences(Array.isArray(d?.sequences) ? d.sequences : []);
      setTokens(Array.isArray(d?.tokens) ? d.tokens : []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load order numbering settings');
    } finally {
      setLoading(false);
    }
  };

  const patch = (scope: ScopeKey, field: keyof OrderNumberingScope, value: any) => {
    setConfig((prev) => ({ ...prev, [scope]: { ...prev[scope], [field]: value } }));
  };

  // Live preview from the server (same code path that allocates real numbers),
  // debounced so typing doesn't hammer the API.
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(async () => {
      for (const scope of ['retail', 'b2b'] as ScopeKey[]) {
        try {
          const res = await orderNumberingAPI.preview(scope, config[scope]);
          const p = (res?.data ?? res)?.preview;
          if (p) setPreview((prev) => ({ ...prev, [scope]: p }));
        } catch { /* preview is best-effort */ }
      }
    }, 400);
    return () => clearTimeout(t);
  }, [config, loading]);

  const dirty = useMemo(
    () => (!!original && JSON.stringify(original) !== JSON.stringify(config)) || separateB2b !== originalSeparateB2b,
    [original, config, separateB2b, originalSeparateB2b]
  );

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      const res = await orderNumberingAPI.update({ ...config, separateB2bSeries: separateB2b });
      const d = res?.data ?? res;
      if (d?.preview) setPreview(d.preview);
      setOriginal(JSON.parse(JSON.stringify(config)));
      setOriginalSeparateB2b(separateB2b);
      setNotice('Order numbering saved. New orders will use this format.');
      setTimeout(() => setNotice(null), 5000);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save order numbering');
    } finally {
      setSaving(false);
    }
  };

  const counterFor = (scope: ScopeKey) =>
    sequences.filter((s) => s.scope === scope).map((s) => `${s.period === 'ALL' ? 'total' : s.period}: ${s.current_value}`).join(' · ');

  const ScopeCard: React.FC<{ scope: ScopeKey }> = ({ scope }) => {
    const c = config[scope];
    const meta = SCOPE_META[scope];
    return (
      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">{meta.icon}{meta.title}</CardTitle>
            <CardDescription>{meta.blurb}</CardDescription>
          </div>
          <label className="flex items-center gap-2 shrink-0">
            <Switch checked={c.enabled} onCheckedChange={(v) => patch(scope, 'enabled', v)} />
            <span className="text-sm">Serialized</span>
          </label>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Preview */}
          <div className="rounded-lg border bg-muted/40 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Next order number</p>
            <p className="mt-1 font-mono text-lg font-semibold break-all">
              {c.enabled ? (preview[scope] || '—') : 'Auto-generated (not serialized)'}
            </p>
            {counterFor(scope) && (
              <p className="mt-1 text-[11px] text-muted-foreground">Counter → {counterFor(scope)}</p>
            )}
          </div>

          {!c.enabled ? (
            <p className="text-sm text-muted-foreground">
              Turn on <span className="font-medium">Serialized</span> to use sequential numbers with your own
              prefix and suffix. While off, orders get a random reference.
            </p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Prefix</Label>
                  <Input value={c.prefix} onChange={(e) => patch(scope, 'prefix', e.target.value)} placeholder="ORD-" />
                </div>
                <div className="space-y-1.5">
                  <Label>Suffix</Label>
                  <Input value={c.suffix} onChange={(e) => patch(scope, 'suffix', e.target.value)} placeholder="(none)" />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Digits</Label>
                  <Input
                    type="number" min={0} max={12} value={c.padding}
                    onChange={(e) => patch(scope, 'padding', Math.min(12, Math.max(0, Number(e.target.value) || 0)))}
                  />
                  <p className="text-[11px] text-muted-foreground">5 → 00042</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Start at</Label>
                  <Input
                    type="number" min={1} value={c.start}
                    onChange={(e) => patch(scope, 'start', Math.max(1, Number(e.target.value) || 1))}
                  />
                  <p className="text-[11px] text-muted-foreground">Applies to a fresh counter</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Restart counter</Label>
                  <Select value={c.reset} onValueChange={(v) => patch(scope, 'reset', v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(RESET_LABELS).map(([k, label]) => (
                        <SelectItem key={k} value={k}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Pattern</Label>
                <Input
                  value={c.format}
                  onChange={(e) => patch(scope, 'format', e.target.value)}
                  className="font-mono text-sm"
                  placeholder="{PREFIX}{SEQ}{SUFFIX}"
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(tokens.length ? tokens : ['{PREFIX}', '{SUFFIX}', '{SEQ}', '{YYYY}', '{YY}', '{MM}', '{DD}']).map((tk) => (
                    <button
                      key={tk}
                      type="button"
                      onClick={() => patch(scope, 'format', `${c.format}${tk}`)}
                      className="rounded border bg-background px-2 py-0.5 font-mono text-[11px] hover:bg-muted"
                      title={`Insert ${tk}`}
                    >
                      {tk}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  e.g. <span className="font-mono">{'{PREFIX}{YYYY}/{SEQ}'}</span> → HM/2026/0001
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-14">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/settings')} className="mb-3 text-muted-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Settings
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Order Numbering</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Choose how order numbers look. Retail/bulk and B2B are numbered independently.
        </p>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-lg leading-none">&times;</button>
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div>
      )}

      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        Changing the format only affects <span className="font-medium text-foreground">future</span> orders — existing
        order numbers never change. Counters only move forward, so numbers stay unique.
      </div>

      {/* Master switch: one book for everything, or a separate B2B series. */}
      <Card>
        <CardContent className="flex flex-col gap-3 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-medium">Separate series for B2B orders</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {separateB2b
                ? 'B2B orders use their own counter, so wholesale and retail can be invoiced as separate books.'
                : 'All orders — retail and B2B — share one continuous series.'}
            </p>
          </div>
          <Switch checked={separateB2b} onCheckedChange={setSeparateB2b} />
        </CardContent>
      </Card>

      <ScopeCard scope="retail" />
      {separateB2b ? (
        <ScopeCard scope="b2b" />
      ) : (
        <Card>
          <CardContent className="py-5 text-sm text-muted-foreground">
            B2B orders are numbered from the retail series above — next B2B order will be{' '}
            <span className="font-mono font-medium text-foreground">{preview.retail || '—'}</span>. Turn on
            “Separate series for B2B orders” to give them their own numbering.
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-end gap-3">
        {dirty && <Badge variant="outline" className="mr-auto">Unsaved changes</Badge>}
        <Button variant="outline" onClick={() => original && setConfig(JSON.parse(JSON.stringify(original)))} disabled={!dirty || saving}>
          <RotateCcw className="mr-2 h-4 w-4" /> Reset
        </Button>
        <Button onClick={handleSave} disabled={!dirty || saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
};

export default OrderNumbering;
