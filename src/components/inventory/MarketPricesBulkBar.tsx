import React, { useEffect, useRef, useState } from 'react';
import { inventoryAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { Btn, SectionCard } from '../erp';

/**
 * Market prices — the spreadsheet round-trip for EXPLICIT per-market / per-country
 * prices (staged migration 173). A market normally prices from INR × the day's
 * rate; a row in this sheet states the price instead, in the market's currency,
 * with a retail AND a B2B figure per SKU. A country row (e.g. CA) beats the
 * market-wide row. Blank cells leave the stored value unchanged; write "clear"
 * to remove a price. Rows in a currency the shopper is not paying in are
 * ignored at checkout (they fall back to the rate), so you can price USD and
 * CAD explicitly and let the rest float.
 */

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

interface ImportSummary {
  processed?: number; created?: number; updated?: number; skipped?: number;
  failed?: Array<{ ref: string; error: string }>;
}

interface MarketOpt { code: string; label: string; defaultCurrency: string; countries: string[] }

const MarketPricesBulkBar: React.FC<{ onImported?: () => void }> = ({ onImported }) => {
  const { hasPerm } = useAuth();
  const canRead = hasPerm('inventory.read');
  const canImport = hasPerm('inventory.adjust');

  const [markets, setMarkets] = useState<MarketOpt[]>([]);
  const [market, setMarket] = useState('intl');
  const [country, setCountry] = useState('');
  const [currency, setCurrency] = useState('');
  const [busy, setBusy] = useState<'' | 'template' | 'export' | 'import'>('');
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Settings key 1.8 — the markets this store sells in (India is always present).
    inventoryAPI.getMarkets().then((v: any) => {
      const list: any[] = Array.isArray(v?.list) ? v.list : Array.isArray(v?.value?.list) ? v.value.list : [];
      const opts = list.filter((m) => m && m.code && m.code !== 'in').map((m) => ({
        code: String(m.code), label: String(m.label ?? m.code), defaultCurrency: String(m.pricing?.defaultCurrency ?? 'USD'),
        countries: Array.isArray(m.countries) ? m.countries : [],
      }));
      setMarkets(opts);
      if (opts.length && !opts.some((o) => o.code === market)) setMarket(opts[0].code);
    }).catch(() => { /* no markets key yet — the intl default still works */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const cur = currency || markets.find((m) => m.code === market)?.defaultCurrency || 'USD';

  const handleTemplate = async () => {
    setError(''); setBusy('template');
    try { downloadBlob(await inventoryAPI.downloadMarketPricesTemplate(), 'market-prices-template.xlsx'); }
    catch (e: any) { setError(e?.response?.data?.message ?? 'Could not download the template.'); }
    finally { setBusy(''); }
  };
  const handleExport = async () => {
    setError(''); setBusy('export');
    try {
      const blob = await inventoryAPI.exportMarketPrices({ market, country: country || undefined, currency: cur });
      downloadBlob(blob, `market-prices-${market}${country ? '-' + country : ''}-${today}.xlsx`);
    } catch (e: any) { setError(e?.response?.data?.message ?? 'Could not export market prices.'); }
    finally { setBusy(''); }
  };
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    setError(''); setSummary(null); setBusy('import');
    try {
      const res = await inventoryAPI.importMarketPrices(file, { market, country: country || undefined, currency: cur });
      setSummary((res?.data ?? res) as ImportSummary);
      onImported?.();
    } catch (err: any) {
      const d = err?.response?.data;
      setError(d?.message ?? 'Could not import the file.');
      if (Array.isArray(d?.errors) && d.errors.length) setSummary({ failed: d.errors.map((x: any) => ({ ref: `Row ${x.row}`, error: x.error })) });
    } finally { setBusy(''); }
  };

  if (!canRead) return null;
  const failed = summary?.failed ?? [];

  return (
    <SectionCard title="Market prices (country-wise retail & B2B)">
      <div className="space-y-3 text-sm">
        <p className="text-gray-600">
          Prices for shoppers outside India are normally worked out from the rupee price at the day&apos;s
          rate. Use this sheet to <strong>state</strong> a price instead — per SKU, in the market&apos;s currency,
          with a retail and a B2B figure — for the whole market or for one country. A country row wins
          over the market row. Blank cells leave the stored value unchanged; type <code>clear</code> to remove one.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-gray-700">
            <span className="block text-xs font-medium text-gray-500">Market</span>
            <select className="mt-1 rounded-md border border-gray-300 px-2 py-1" value={market} onChange={(e) => { setMarket(e.target.value); setCountry(''); setCurrency(''); }}>
              {(markets.length ? markets : [{ code: 'intl', label: 'International', defaultCurrency: 'USD', countries: ['*'] }]).map((m) => (
                <option key={m.code} value={m.code}>{m.label} ({m.code})</option>
              ))}
            </select>
          </label>
          <label className="text-gray-700">
            <span className="block text-xs font-medium text-gray-500">Country (optional)</span>
            <input className="mt-1 w-24 rounded-md border border-gray-300 px-2 py-1 uppercase" placeholder="e.g. CA" maxLength={2}
              value={country} onChange={(e) => setCountry(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} />
          </label>
          <label className="text-gray-700">
            <span className="block text-xs font-medium text-gray-500">Currency</span>
            <input className="mt-1 w-24 rounded-md border border-gray-300 px-2 py-1 uppercase" placeholder={cur} maxLength={3}
              value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Btn variant="outline" onClick={handleExport} disabled={!!busy}>{busy === 'export' ? 'Exporting…' : '⬇ Export sheet'}</Btn>
            <Btn variant="ghost" onClick={handleTemplate} disabled={!!busy}>{busy === 'template' ? 'Preparing…' : 'Blank template'}</Btn>
            {canImport && (
              <>
                <Btn onClick={() => fileRef.current?.click()} disabled={!!busy}>{busy === 'import' ? 'Importing…' : '⬆ Import sheet'}</Btn>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
              </>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Export first: every SKU arrives with its Variation ID, the rupee catalogue prices and the
          price currently stated for this market/country. A price is charged in {cur} exactly as typed;
          the rupee booking figure is worked out at the rate on the day of the sale.
        </p>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-red-700">{error}</p>}
        {summary && (
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
            <div className="flex flex-wrap gap-4 text-gray-800">
              {summary.processed != null && <span>Rows: <strong>{summary.processed}</strong></span>}
              {summary.created != null && <span>Created: <strong>{summary.created}</strong></span>}
              {summary.updated != null && <span>Updated: <strong>{summary.updated}</strong></span>}
              {summary.skipped != null && <span>Skipped (nothing to apply): <strong>{summary.skipped}</strong></span>}
              {failed.length > 0 && <span className="text-red-700">Failed: <strong>{failed.length}</strong></span>}
            </div>
            {failed.length > 0 && (
              <ul className="mt-2 max-h-40 space-y-0.5 overflow-auto text-xs text-red-700">
                {failed.slice(0, 200).map((f, i) => <li key={i}>{f.ref}: {f.error}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
};

export default MarketPricesBulkBar;
