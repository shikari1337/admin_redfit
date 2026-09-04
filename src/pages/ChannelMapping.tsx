import { useEffect, useState } from 'react';
import { channelsAPI } from '../services/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';
import { Wand2, Save, Trash2, Upload, Download } from 'lucide-react';
import { Pagination } from '@/components/erp';

interface Connection { id: string; platform_code: string; display_name?: string; }
interface Mapping {
  id: string; channel_id: string; external_id: string; external_sku?: string; external_title?: string;
  buffer_qty: number; sync_inventory: boolean; is_active: boolean;
}

// Human label for the external id per platform (ASIN, FSIN, …)
const EXTERNAL_LABEL: Record<string, string> = {
  amazon_in: 'Amazon Seller SKU / ASIN', flipkart: 'Flipkart SKU (FSIN)', meesho: 'Meesho SKU',
  tata_1mg: 'Tata 1mg SKU', healthmug: 'Healthmug SKU',
  google_shopping: 'Google offer ID', facebook_catalog: 'Meta retailer ID', whatsapp_catalog: 'Meta retailer ID',
};

const PAGE_SIZE = 200;

export default function ChannelMapping() {
  const { toast } = useToast();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [channelId, setChannelId] = useState<string>('');
  const [rows, setRows] = useState<Mapping[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1); // 1-indexed (matches the shared Pagination component)
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState(''); // debounced value actually queried
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [csv, setCsv] = useState('');
  const [showCsv, setShowCsv] = useState(false);

  useEffect(() => { channelsAPI.getConnections().then((c: Connection[]) => {
    setConnections(c); if (c.length) setChannelId(c[0].id);
  }); }, []);

  // Debounce the search box, then land on page 1 for the new term.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);
  // Switching channel also resets to page 1.
  useEffect(() => { setPage(1); }, [channelId]);

  // A full-catalog channel (e.g. Google/Meta feed after Auto-map) can carry tens
  // of thousands of mapping rows — load one page at a time, not the whole table.
  useEffect(() => {
    if (!channelId) { setRows([]); setTotal(0); return; }
    let cancelled = false;
    setLoading(true);
    channelsAPI.getMappings({ channelId, search: search || undefined, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }).then((res) => {
      if (cancelled) return;
      setRows(res.data); setTotal(res.total); setLoading(false);
    });
    return () => { cancelled = true; };
  }, [channelId, page, search]);
  const reload = async () => {
    if (!channelId) return;
    setLoading(true);
    const res = await channelsAPI.getMappings({ channelId, search: search || undefined, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
    setRows(res.data); setTotal(res.total); setLoading(false);
  };

  const platformCode = connections.find((c) => c.id === channelId)?.platform_code || '';
  const idLabel = EXTERNAL_LABEL[platformCode] || 'Marketplace ID';

  const patch = (id: string, key: keyof Mapping, value: any) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [key]: value } : r)));

  const saveRow = async (r: Mapping) => {
    await channelsAPI.updateMapping(r.id, { external_id: r.external_id, buffer_qty: Number(r.buffer_qty) || 0, sync_inventory: r.sync_inventory });
    toast({ title: 'Mapping saved', description: r.external_title || r.external_sku || r.external_id });
  };
  const removeRow = async (r: Mapping) => {
    await channelsAPI.deleteMapping(r.id);
    setRows((rs) => rs.filter((x) => x.id !== r.id));
  };
  const autoMap = async () => {
    const res = await channelsAPI.autoMap(channelId);
    toast({ title: 'Auto-map complete', description: res?.message });
    await reload();
  };

  // CSV bulk fill: lines of "internalSKU,marketplaceID" → set external_id on the matching row.
  // Looks each SKU up via the search endpoint (not the currently-loaded page) since
  // the table only ever holds one page of a channel that can run to 40k+ rows.
  const applyCsv = async () => {
    let updated = 0;
    for (const line of csv.split(/\r?\n/)) {
      const [sku, ext] = line.split(',').map((s) => s?.trim());
      if (!sku || !ext) continue;
      const res = await channelsAPI.getMappings({ channelId, search: sku, limit: 10 });
      const row = res.data.find((r: Mapping) => r.external_sku === sku);
      if (row) { await channelsAPI.updateMapping(row.id, { external_id: ext }); updated++; }
    }
    toast({ title: 'CSV applied', description: `${updated} mappings updated` });
    setShowCsv(false); setCsv('');
    await reload();
  };

  // Pages through the full (possibly search-filtered) result set — the table
  // itself only ever holds PAGE_SIZE rows, so export can't just read `rows`.
  const exportCsv = async () => {
    setExporting(true);
    try {
      const lines = ['internal_sku,marketplace_id'];
      const limit = 500;
      let offset = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const res = await channelsAPI.getMappings({ channelId, search: search || undefined, limit, offset });
        for (const r of res.data) lines.push(`${r.external_sku || ''},${r.external_id || ''}`);
        offset += limit;
        if (res.data.length === 0 || offset >= res.total) break;
      }
      const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `${platformCode}-mappings.csv`; a.click();
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Channel SKU Mapping</h1>
          <p className="text-sm text-muted-foreground">Map each product to its ID on the selected channel. <Link to="/channels" className="text-primary">← Channels</Link></p>
        </div>
      </div>

      <Card><CardContent className="p-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[240px]">
          <Label>Channel</Label>
          <Select value={channelId} onValueChange={setChannelId}>
            <SelectTrigger><SelectValue placeholder="Select a channel" /></SelectTrigger>
            <SelectContent>
              {connections.map((c) => <SelectItem key={c.id} value={c.id}>{c.display_name || c.platform_code}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[200px]">
          <Label>Search</Label>
          <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="SKU, title, or ID…" className="h-9" disabled={!channelId} />
        </div>
        <Button variant="outline" onClick={autoMap} disabled={!channelId}><Wand2 className="h-4 w-4 mr-2" /> Auto-map by SKU</Button>
        <Button variant="outline" onClick={() => setShowCsv((s) => !s)} disabled={!channelId}><Upload className="h-4 w-4 mr-2" /> Bulk fill (CSV)</Button>
        <Button variant="outline" onClick={exportCsv} disabled={!total || exporting}>
          <Download className="h-4 w-4 mr-2" /> {exporting ? 'Exporting…' : 'Export'}
        </Button>
      </CardContent></Card>

      {showCsv && (
        <Card><CardContent className="p-4 space-y-2">
          <Label>Paste lines of <code>internal_sku,marketplace_id</code></Label>
          <Textarea rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'HM-ARN-30CH-30ML,B0ABCD1234\nHM-BEL-200,B0EFGH5678'} />
          <div className="flex gap-2"><Button onClick={applyCsv}>Apply</Button><Button variant="ghost" onClick={() => setShowCsv(false)}>Cancel</Button></div>
        </CardContent></Card>
      )}

      <Card><CardContent className="p-0">
        {loading ? <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          : !channelId ? <p className="p-4 text-sm text-muted-foreground">Connect a channel first.</p>
          : rows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              {search ? 'No mappings match your search.' : <>No mappings yet. Click <b>Auto-map by SKU</b> to create a row per product, then fill in the {idLabel}.</>}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground border-b bg-gray-50">
                    <tr>
                      <th className="p-3">Product</th>
                      <th className="p-3">Internal SKU</th>
                      <th className="p-3">{idLabel}</th>
                      <th className="p-3 w-24">Buffer</th>
                      <th className="p-3 w-20">Sync</th>
                      <th className="p-3 w-28"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="p-3">{r.external_title || <span className="text-muted-foreground">—</span>}</td>
                        <td className="p-3 font-mono text-xs">{r.external_sku}</td>
                        <td className="p-3"><Input value={r.external_id || ''} onChange={(e) => patch(r.id, 'external_id', e.target.value)} className="h-8" /></td>
                        <td className="p-3"><Input type="number" min={0} value={r.buffer_qty ?? 0} onChange={(e) => patch(r.id, 'buffer_qty', e.target.value)} className="h-8 w-20" /></td>
                        <td className="p-3"><Switch checked={r.sync_inventory} onCheckedChange={(v) => patch(r.id, 'sync_inventory', v)} /></td>
                        <td className="p-3 flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => saveRow(r)}><Save className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => removeRow(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} className="border-t px-3 py-3" />
            </>
          )}
      </CardContent></Card>
    </div>
  );
}
