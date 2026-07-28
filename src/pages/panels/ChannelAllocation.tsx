import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Boxes, Search, Save, AlertTriangle, Loader2, Check } from 'lucide-react';
import { channelAllocationAPI } from '../../services/api';
import {
  Page, PageHeader, SectionCard, Btn, Field, TextInput, SelectInput,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, Chip, StatCard, StatGrid,
} from '../../components/erp';

/**
 * PER-CHANNEL AVAILABILITY ALLOCATION ("virtual bins", migration 090).
 *
 * Plain-language screen: search a SKU, see the one shared pool, then promise at
 * most N (or a %) of it to each channel — "so Amazon shows 40, Flipkart 30, and
 * 30 stay unallocated". A rush on one channel can no longer oversell the others.
 * Nothing is physically split: this is only a PUBLISH cap the sync engine obeys.
 */

interface ChannelRow {
  channel_id: string;
  platform_code: string;
  display_name: string | null;
  buffer_pct: number;
  buffer_qty: number;
  buffered: number;
  cap_units: number | null;
  cap_pct: number | null;
  capped: boolean;
  published: number;
}
interface Preview {
  variation: { id: string; sku: string | null; name: string | null; product_id: string | null; pool: number };
  enabled: boolean;
  channels: ChannelRow[];
  published_sum: number;
  unallocated: number;
}

type CapMode = 'none' | 'units' | 'pct';
interface EditState { mode: CapMode; value: string; saving?: boolean; saved?: boolean }

const ChannelAllocation: React.FC = () => {
  const [enabled, setEnabled] = useState(false);
  const [flagBusy, setFlagBusy] = useState(false);
  const [sku, setSku] = useState('');
  const [data, setData] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [edits, setEdits] = useState<Record<string, EditState>>({});

  useEffect(() => { channelAllocationAPI.getConfig().then((c) => setEnabled(!!c.enabled)); }, []);

  const seedEdits = (p: Preview) => {
    const next: Record<string, EditState> = {};
    for (const c of p.channels) {
      next[c.channel_id] = c.cap_units != null
        ? { mode: 'units', value: String(c.cap_units) }
        : c.cap_pct != null
          ? { mode: 'pct', value: String(c.cap_pct) }
          : { mode: 'none', value: '' };
    }
    setEdits(next);
  };

  const load = async (term?: string) => {
    const key = (term ?? sku).trim();
    if (!key) return;
    setLoading(true); setMsg('');
    try {
      const p = await channelAllocationAPI.preview(key);
      setData(p); seedEdits(p); setEnabled(!!p.enabled);
    } catch (e: any) {
      setData(null);
      setMsg(e?.response?.data?.message ?? 'No product variation found for that SKU.');
    } finally { setLoading(false); }
  };

  const toggleFlag = async () => {
    setFlagBusy(true);
    try {
      const c = await channelAllocationAPI.setEnabled(!enabled);
      setEnabled(!!c.enabled);
      if (data) await load(data.variation.sku ?? data.variation.id);
    } finally { setFlagBusy(false); }
  };

  const setEdit = (chId: string, patch: Partial<EditState>) =>
    setEdits((e) => ({ ...e, [chId]: { ...e[chId], ...patch, saved: false } }));

  const saveRow = async (c: ChannelRow) => {
    if (!data) return;
    const ed = edits[c.channel_id];
    setEdit(c.channel_id, { saving: true });
    const cap_units = ed.mode === 'units' && ed.value !== '' ? Number(ed.value) : null;
    const cap_pct = ed.mode === 'pct' && ed.value !== '' ? Number(ed.value) : null;
    try {
      await channelAllocationAPI.save({ channel_id: c.channel_id, variation_id: data.variation.id, cap_units, cap_pct });
      await load(data.variation.sku ?? data.variation.id);
      setEdit(c.channel_id, { saving: false, saved: true });
    } catch (e: any) {
      setMsg(e?.response?.data?.message ?? 'Could not save the cap.');
      setEdit(c.channel_id, { saving: false });
    }
  };

  const v = data?.variation;

  return (
    <Page>
      <PageHeader
        title="Channel Allocation"
        icon={Boxes}
        description="Promise at most part of your stock to each sales channel — so a rush on one can't oversell the others. This is a publish cap only; your stock is never physically split."
        actions={<Btn asChild variant="outline"><Link to="/channels">← Channels</Link></Btn>}
      />

      {/* Master switch + plain warning */}
      <SectionCard>
        <div className="flex flex-wrap items-center justify-between gap-3 p-1">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">Per-channel caps</span>
              <Chip tone={enabled ? 'green' : 'neutral'}>{enabled ? 'ON' : 'OFF'}</Chip>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              {enabled
                ? 'Caps are live. Each channel publishes at most its allocated amount; if your caps add up to more than you have, they are squeezed proportionally so you can never oversell across channels.'
                : 'Until you turn this on, every channel sees your whole stock — the same number is published to all of them, so two channels can each sell the same units.'}
            </p>
          </div>
          <Btn variant={enabled ? 'dangerOutline' : 'success'} onClick={toggleFlag} disabled={flagBusy}>
            {flagBusy ? <Loader2 className="animate-spin" /> : enabled ? 'Turn off caps' : 'Turn on caps'}
          </Btn>
        </div>
        {!enabled && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>You can set caps below while this is off — they take effect only once you turn caps on.</span>
          </div>
        )}
      </SectionCard>

      {/* SKU search */}
      <SectionCard>
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); load(); }}>
          <Field label="Find a product by SKU" className="min-w-[280px] flex-1">
            <TextInput value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g. HM-ARN-30CH-30ML" />
          </Field>
          <Btn type="submit" disabled={loading || !sku.trim()}>
            {loading ? <Loader2 className="animate-spin" /> : <Search />} See its pool
          </Btn>
        </form>
        {msg && <p className="mt-2 text-sm text-red-600">{msg}</p>}
      </SectionCard>

      {v && data && (
        <>
          <StatGrid>
            <StatCard label="Product" value={v.sku || '—'} sub={v.name || undefined} />
            <StatCard label="Shared pool (sellable)" value={v.pool} sub="stock − reserved" />
            <StatCard label="Promised across channels" value={data.published_sum} tone={data.published_sum > v.pool ? 'warn' : 'default'} />
            <StatCard label="Unallocated" value={data.unallocated} sub="not promised to anyone" />
          </StatGrid>

          <SectionCard
            title="Per channel"
            description={enabled
              ? 'Set each channel a cap in units or a % of the pool. The "Publishes now" column shows exactly what the sync engine will advertise.'
              : 'Caps are off — every channel currently publishes the whole pool. Set caps now and turn them on above.'}
          >
            {data.channels.length === 0 ? (
              <p className="p-2 text-sm text-gray-500">
                This SKU is not mapped to any active channel yet. Add it in <Link to="/channels/mapping" className="text-primary underline">SKU Mapping</Link> first.
              </p>
            ) : (
              <TableShell>
                <THead>
                  <tr>
                    <Th>Channel</Th>
                    <Th num>Channel sees (buffered)</Th>
                    <Th>Cap type</Th>
                    <Th num>Cap value</Th>
                    <Th num>Publishes now</Th>
                    <Th />
                  </tr>
                </THead>
                <TBody>
                  {data.channels.map((c) => {
                    const ed = edits[c.channel_id] ?? { mode: 'none', value: '' };
                    return (
                      <Tr key={c.channel_id}>
                        <Td>
                          <div className="font-medium text-gray-900">{c.display_name || c.platform_code}</div>
                          <div className="font-mono text-xs text-gray-400">{c.platform_code}</div>
                        </Td>
                        <Td num className="tabular-nums">{c.buffered}</Td>
                        <Td>
                          <SelectInput
                            value={ed.mode}
                            onChange={(e) => setEdit(c.channel_id, { mode: e.target.value as CapMode, value: e.target.value === 'none' ? '' : ed.value })}
                            className="h-8 w-28"
                          >
                            <option value="none">Unlimited</option>
                            <option value="units">Units</option>
                            <option value="pct">% of pool</option>
                          </SelectInput>
                        </Td>
                        <Td num>
                          <TextInput
                            type="number" min={0} max={ed.mode === 'pct' ? 100 : undefined}
                            disabled={ed.mode === 'none'}
                            value={ed.value}
                            onChange={(e) => setEdit(c.channel_id, { value: e.target.value })}
                            className="h-8 w-24 text-right"
                            placeholder={ed.mode === 'none' ? '—' : ed.mode === 'pct' ? '%' : 'units'}
                          />
                        </Td>
                        <Td num>
                          <span className={`tabular-nums font-semibold ${enabled && c.capped ? 'text-emerald-700' : 'text-gray-900'}`}>{c.published}</span>
                        </Td>
                        <Td num>
                          <Btn size="sm" variant="outline" onClick={() => saveRow(c)} disabled={ed.saving}>
                            {ed.saving ? <Loader2 className="animate-spin" /> : ed.saved ? <Check className="text-emerald-600" /> : <Save />}
                            Save
                          </Btn>
                        </Td>
                      </Tr>
                    );
                  })}
                  {data.channels.length === 0 && <EmptyRow colSpan={6}>No channels.</EmptyRow>}
                </TBody>
              </TableShell>
            )}

            {data.channels.length > 0 && (
              <p className="mt-3 text-sm text-gray-600">
                {enabled ? (
                  <>So {data.channels.map((c, i) => (
                    <span key={c.channel_id}>
                      {i > 0 ? ', ' : ''}<b>{c.display_name || c.platform_code}</b> shows <b className="tabular-nums">{c.published}</b>
                    </span>
                  ))}
                  {data.unallocated > 0 && <>, and <b className="tabular-nums">{data.unallocated}</b> stay unallocated</>}.
                  {data.published_sum <= v.pool
                    ? ' Total promised never exceeds your pool.'
                    : ' (Caps oversubscribe the pool — the sync engine squeezes them proportionally.)'}</>
                ) : (
                  <>With caps off, every channel publishes the full pool of <b className="tabular-nums">{v.pool}</b>.</>
                )}
              </p>
            )}
          </SectionCard>
        </>
      )}
    </Page>
  );
};

export default ChannelAllocation;
