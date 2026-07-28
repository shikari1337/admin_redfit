import { useEffect, useState } from 'react';
import { b2bAPI } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Save, Plus, Trash2 } from 'lucide-react';

interface TierRow { name: string; discount_pct: string; }

/**
 * Edits store.settings.b2b — the SAME object utils/b2bPricing.ts reads for
 * P4 (customer-tier discount) and P5 (store-wide B2B default). Anything saved
 * here takes effect on the next price resolution; product slabs (P2/P3) and
 * negotiated contracts (P1) still win over these.
 */
export default function B2BTiers() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [defaultPct, setDefaultPct] = useState('0');
  const [priceMode, setPriceMode] = useState<'exclusive' | 'inclusive'>('exclusive');
  const [tiers, setTiers] = useState<TierRow[]>([]);

  useEffect(() => {
    b2bAPI.getSettings()
      .then((r) => {
        // The axios interceptor already unwraps {success,data} → r IS the
        // settings object; tolerate both shapes so this never loads blank.
        const s = (r && typeof r === 'object' && 'enabled' in r) ? r : (r?.data ?? {});
        setEnabled(!!s.enabled);
        setDefaultPct(String(s.default_discount_pct ?? 0));
        setPriceMode(s.price_mode === 'inclusive' ? 'inclusive' : 'exclusive');
        setTiers(Object.entries(s.tiers ?? {}).map(([name, v]: [string, any]) => ({
          name, discount_pct: String(v?.discount_pct ?? 0),
        })));
      })
      .catch(() => setError('Failed to load B2B settings'))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setError(null);
    const names = tiers.map((t) => t.name.trim().toLowerCase()).filter(Boolean);
    if (new Set(names).size !== names.length) { setError('Tier names must be unique.'); return; }
    if (tiers.some((t) => !t.name.trim())) { setError('Every tier needs a name.'); return; }
    if (tiers.some((t) => Number(t.discount_pct) < 0 || Number(t.discount_pct) > 100)) {
      setError('Tier discounts must be between 0 and 100%.'); return;
    }
    setSaving(true);
    try {
      // Tier keys are lowercased: b2bPricing matches customer.b2b_tier case-insensitively.
      const payload = {
        enabled,
        default_discount_pct: Number(defaultPct) || 0,
        price_mode: priceMode,
        tiers: Object.fromEntries(tiers.map((t) => [t.name.trim().toLowerCase(), { discount_pct: Number(t.discount_pct) || 0 }])),
      };
      await b2bAPI.updateSettings(payload);
      setSuccess('B2B plans saved — pricing updates immediately.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">B2B Plans &amp; Tiers</h3>
          <p className="text-sm text-muted-foreground">Wholesale pricing tiers assigned to approved business accounts.</p>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save
        </Button>
      </div>

      {error && <div className="bg-destructive/15 text-destructive p-3 rounded-md text-sm">{error}</div>}
      {success && <div className="bg-green-50 text-green-700 border border-green-200 p-3 rounded-md text-sm">{success}</div>}

      <Card>
        <CardHeader>
          <CardTitle>Global</CardTitle>
          <CardDescription>Applies to every approved B2B customer unless a tier, slab or contract overrides it.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>B2B pricing enabled</Label>
              <p className="text-xs text-muted-foreground">Turn off to bill every customer at retail.</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div className="space-y-2">
            <Label>Store-wide default discount (%) — P5</Label>
            <Input type="number" min="0" max="100" value={defaultPct} onChange={(e) => setDefaultPct(e.target.value)} />
            <p className="text-xs text-muted-foreground">Fallback for a B2B customer with no tier and no product slab. 0 = retail price.</p>
          </div>
          <div className="space-y-2">
            <Label>Price mode</Label>
            <select value={priceMode} onChange={(e) => setPriceMode(e.target.value as any)}
              className="w-full h-9 px-2 border rounded-md text-sm bg-background">
              <option value="exclusive">Tax exclusive (B2B standard)</option>
              <option value="inclusive">Tax inclusive</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tiers — P4</CardTitle>
          <CardDescription>
            e.g. <b>doctor</b> 10%, <b>retailer</b> 15%, <b>distributor</b> 22%. Assign a tier when approving an application.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {tiers.length === 0 && <p className="text-sm text-muted-foreground">No tiers yet — add one below.</p>}
          {tiers.map((t, idx) => (
            <div key={idx} className="flex items-end gap-3">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs">Tier name</Label>
                <Input value={t.name} placeholder="distributor"
                  onChange={(e) => setTiers((rows) => rows.map((r, i) => i === idx ? { ...r, name: e.target.value } : r))} />
              </div>
              <div className="w-40 space-y-1.5">
                <Label className="text-xs">Discount (%)</Label>
                <Input type="number" min="0" max="100" value={t.discount_pct}
                  onChange={(e) => setTiers((rows) => rows.map((r, i) => i === idx ? { ...r, discount_pct: e.target.value } : r))} />
              </div>
              <Button variant="ghost" size="icon" onClick={() => setTiers((rows) => rows.filter((_, i) => i !== idx))}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setTiers((r) => [...r, { name: '', discount_pct: '0' }])}>
            <Plus className="mr-2 h-4 w-4" />Add tier
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How a B2B price is chosen</CardTitle>
          <CardDescription>First match wins — most specific rule stops the search.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="text-sm space-y-1.5 list-decimal list-inside text-muted-foreground">
            <li><b className="text-foreground">P1 Contract</b> — negotiated price for this customer × product</li>
            <li><b className="text-foreground">P2 Tier slab</b> — bulk slab matching their tier + quantity</li>
            <li><b className="text-foreground">P3 Generic slab</b> — bulk slab for any tier + quantity</li>
            <li><b className="text-foreground">P4 Tier discount</b> — the tier % set above</li>
            <li><b className="text-foreground">P5 Store default</b> — the default % set above</li>
            <li><b className="text-foreground">P6 Retail</b> — normal price (never above MRP)</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
