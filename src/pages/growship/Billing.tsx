import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Receipt, Loader2, FileDown, Info } from 'lucide-react';
import { errorText } from '../../services/api';
import { fmtRupees } from '@/lib/money';
import { downloadCsv, type CsvColumn } from '@/lib/csv';
import { formatDate } from '../../utils/date';
import {
  Page, PageHeader, SectionCard, StatCard, StatGrid, TableShell, THead, Th, TBody, Tr, Td, EmptyRow, Btn, FilterBar, Chip,
} from '../../components/erp';
import { DEFAULT_FROM, DEFAULT_TO, RangeFields } from '../payments/common';
import { chargeSplit, growshipAPI, gsStatusText, gramsText, type GsChargeSplit, type GsConsignment } from '@/lib/v2/growship';

const PAGE_SIZE = 25;
/** Parcels are read 200 at a time (the door's most) up to this many for the totals and the file. */
const READ_PAGE = 200;
const READ_CAP = 2000;

const money = (n: number | null | undefined) => (n == null ? '' : fmtRupees(n));
const sum = (rows: GsConsignment[], f: (c: GsConsignment) => number | null | undefined) =>
  Math.round(rows.reduce((s, c) => s + (Number(f(c)) || 0), 0) * 100) / 100;

/** Adjustments after booking (weight, return, cancellation), in rupees, from the parcel's charge lines. */
const adjustmentsOf = (c: GsConsignment | undefined): number | null => {
  const lines = (c?.charges ?? []).filter((l) => l.stage === 'adjustment');
  if (!lines.length) return null;
  return Math.round(lines.reduce((s, l) => s + (Number(l.amount_minor) || 0), 0)) / 100;
};

/**
 * What Growcord Ship charged, parcel by parcel, for a period (owner 26 Nov 2026: "billing details charges and
 * other details"): freight, the COD fee, return charges and other lines from each parcel's own charge lines,
 * GST, the amount at booking and the final amount, with totals and a CSV. Read from Growcord Ship's own parcel
 * list (`GET /api/v2/ship/consignments`); the charge lines of the parcels on screen are read as they show.
 */
const GrowshipBilling: React.FC = () => {
  const [range, setRange] = useState({ from: DEFAULT_FROM(), to: DEFAULT_TO() });
  const [rows, setRows] = useState<GsConsignment[] | null>(null);
  const [capped, setCapped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [details, setDetails] = useState<Record<string, GsConsignment>>({});
  const [fileBusy, setFileBusy] = useState<string | null>(null);
  const asked = useRef(new Set<string>());
  /** Every parcel read whole so far (the state above draws the table; this is what a file is built from). */
  const known = useRef<Record<string, GsConsignment>>({});

  useEffect(() => {
    let live = true;
    setRows(null); setError(null); setPage(1); setCapped(false);
    (async () => {
      const out: GsConsignment[] = [];
      for (let offset = 0; ; offset += READ_PAGE) {
        const p = await growshipAPI.consignments({ from: range.from, to: range.to, limit: READ_PAGE, offset });
        out.push(...p.items);
        if (p.items.length < READ_PAGE || out.length >= p.total) break;
        if (out.length >= READ_CAP) { if (live) setCapped(true); break; }
      }
      if (live) setRows(out);
    })().catch((e) => { if (live) { setRows([]); setError(errorText(e, 'Growcord Ship could not be read.')); } });
    return () => { live = false; };
  }, [range.from, range.to]);

  const all = rows ?? [];
  const shown = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));

  /** The charge lines of the given parcels, three at a time, each read once. */
  const readDetails = async (ids: string[]) => {
    const todo = ids.filter((id) => !asked.current.has(id));
    todo.forEach((id) => asked.current.add(id));
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(3, todo.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= todo.length) return;
        try {
          const d = await growshipAPI.consignment(todo[i]);
          known.current = { ...known.current, [todo[i]]: d };
          setDetails(known.current);
        } catch {
          asked.current.delete(todo[i]);
        }
      }
    }));
  };
  // Only the parcels on screen are read whole.
  useEffect(() => { void readDetails(shown.map((c) => c.id)); }, [rows, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const splitIn = (m: Record<string, GsConsignment>, c: GsConsignment): GsChargeSplit | null => (m[c.id] ? chargeSplit(m[c.id].charges) : null);
  /** The final amount: Growcord Ship's own when it has settled it, else the booking plus any adjustment lines. */
  const finalIn = (m: Record<string, GsConsignment>, c: GsConsignment): number | null => {
    if (c.final_sell != null) return c.final_sell;
    if (c.sell_with_gst == null) return null;
    return m[c.id] ? Math.round((c.sell_with_gst + (adjustmentsOf(m[c.id]) ?? 0)) * 100) / 100 : c.sell_with_gst;
  };

  const totals = useMemo(() => ({
    parcels: all.length,
    cancelled: all.filter((c) => c.status === 'cancelled' || !!c.cancelled_at).length,
    before: sum(all, (c) => c.sell_price),
    gst: sum(all, (c) => c.gst),
    booked: sum(all, (c) => c.sell_with_gst),
    cod: sum(all.filter((c) => c.payment_mode === 'cod'), (c) => c.cod_amount),
    settled: all.filter((c) => c.final_sell != null).length,
  }), [all]);

  const columnsFor = (m: Record<string, GsConsignment>): CsvColumn<GsConsignment>[] => [
    { key: 'created_at', label: 'Booked', format: (c) => formatDate(c.created_at, 'yyyy-MM-dd HH:mm', '') },
    { key: 'consignment_number', label: 'Growcord Ship number', format: (c) => c.consignment_number ?? '' },
    { key: 'awb', label: 'AWB', format: (c) => c.awb ?? '' },
    { key: 'shipper_reference', label: 'Order or reference', format: (c) => c.shipper_reference ?? '' },
    { key: 'destination_pincode', label: 'To pincode', format: (c) => c.destination_pincode ?? '' },
    { key: 'zone_code', label: 'Zone', format: (c) => c.zone_code ?? '' },
    { key: 'chargeable_weight_g', label: 'Charged weight (g)', format: (c) => c.chargeable_weight_g ?? '' },
    { key: 'payment_mode', label: 'Payment', format: (c) => (c.payment_mode === 'cod' ? 'COD' : 'Prepaid') },
    { key: 'cod_amount', label: 'COD to collect', format: (c) => (c.payment_mode === 'cod' && c.cod_amount != null ? c.cod_amount.toFixed(2) : '') },
    { key: 'status', label: 'Status', format: (c) => gsStatusText(c.board_status || c.status) },
    { key: 'freight', label: 'Freight', format: (c) => splitIn(m, c)?.freight?.toFixed(2) ?? '' },
    { key: 'cod_fee', label: 'COD fee', format: (c) => splitIn(m, c)?.cod?.toFixed(2) ?? '' },
    { key: 'rto', label: 'Return (RTO)', format: (c) => splitIn(m, c)?.rto?.toFixed(2) ?? '' },
    { key: 'other', label: 'Other', format: (c) => splitIn(m, c)?.other?.toFixed(2) ?? '' },
    { key: 'sell_price', label: 'Before GST', format: (c) => c.sell_price?.toFixed(2) ?? '' },
    { key: 'gst', label: 'GST', format: (c) => c.gst?.toFixed(2) ?? '' },
    { key: 'sell_with_gst', label: 'At booking with GST', format: (c) => c.sell_with_gst?.toFixed(2) ?? '' },
    { key: 'final', label: 'Final', format: (c) => finalIn(m, c)?.toFixed(2) ?? '' },
  ];

  /** The period as a file; with the charge lines, every parcel is read whole first. */
  const download = async (withLines: boolean) => {
    if (!all.length) return;
    if (withLines) {
      setFileBusy('lines');
      try { await readDetails(all.map((c) => c.id)); } finally { setFileBusy(null); }
    }
    downloadCsv(`growcord-ship-charges-${range.from}-to-${range.to}`, columnsFor(known.current), all);
  };

  return (
    <Page>
      <PageHeader
        icon={Receipt}
        title="Billing and charges"
        description="What Growcord Ship charged for each parcel: freight, COD fee, return charges, GST and the final amount."
      />

      <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Growcord Ship does not issue tax invoices for freight yet. These figures come from each parcel's booking and any
          later change (weight, return or cancellation), and the money itself moves through your wallet.
        </span>
      </div>

      <SectionCard title="Period" description="Parcels booked between these dates.">
        <FilterBar>
          <RangeFields from={range.from} to={range.to} onChange={setRange} />
          <div className="flex flex-wrap items-end gap-2">
            <Btn variant="outline" disabled={!all.length || !!fileBusy} onClick={() => download(false)}><FileDown /> CSV</Btn>
            <Btn variant="outline" disabled={!all.length || !!fileBusy} onClick={() => download(true)} title="Reads every parcel's charge lines first, so it takes longer">
              {fileBusy === 'lines' ? <Loader2 className="animate-spin" /> : <FileDown />} CSV with charge lines
            </Btn>
          </div>
        </FilterBar>
        {capped && <p className="mt-2 text-sm text-amber-800">Only the newest {READ_CAP} parcels of this period are counted. Choose fewer days for the rest.</p>}
      </SectionCard>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <StatGrid cols={4}>
        <StatCard label="Parcels" value={rows ? totals.parcels.toLocaleString('en-IN') : '...'} sub={rows && totals.cancelled ? `${totals.cancelled} cancelled` : undefined} />
        <StatCard label="Before GST" value={rows ? fmtRupees(totals.before) : '...'} />
        <StatCard label="GST" value={rows ? fmtRupees(totals.gst) : '...'} />
        <StatCard
          label="At booking with GST"
          value={rows ? fmtRupees(totals.booked) : '...'}
          sub={rows ? `${totals.settled} with a final amount from Growcord Ship. COD to collect on these parcels: ${fmtRupees(totals.cod)}.` : undefined}
        />
      </StatGrid>

      <SectionCard flush title="Parcels" description="Freight, COD fee, return and other come from each parcel's charge lines, read for the parcels on this page.">
        <TableShell className="rounded-none border-0 shadow-none">
          <table className="w-full text-sm">
            <THead>
              <Th>Booked</Th><Th>Parcel</Th><Th>Order</Th><Th>To</Th><Th>Status</Th>
              <Th num>Freight</Th><Th num>COD fee</Th><Th num>Return</Th><Th num>Other</Th><Th num>GST</Th><Th num>At booking</Th><Th num>Final</Th>
            </THead>
            <TBody>
              {rows === null && <EmptyRow colSpan={12}>Reading...</EmptyRow>}
              {rows && rows.length === 0 && <EmptyRow colSpan={12}>No Growcord Ship parcel was booked in these dates.</EmptyRow>}
              {shown.map((c) => {
                const s = splitIn(details, c);
                const fin = finalIn(details, c);
                const changed = fin != null && c.sell_with_gst != null && Math.abs(fin - c.sell_with_gst) >= 0.01;
                const cancelled = c.status === 'cancelled' || !!c.cancelled_at;
                return (
                  <Tr key={c.id} className={cancelled ? 'opacity-70' : undefined}>
                    <Td muted className="whitespace-nowrap">{formatDate(c.created_at, 'dd MMM yyyy', '')}</Td>
                    <Td>
                      <div className="font-mono text-xs">{c.consignment_number || ''}</div>
                      <div className="font-mono text-xs text-gray-500">{c.awb || 'No AWB yet'}</div>
                    </Td>
                    <Td>{c.shipper_reference || ''}</Td>
                    <Td className="text-xs">
                      {[c.destination_pincode, c.zone_code ? `zone ${c.zone_code}` : null].filter(Boolean).join(', ')}
                      <div className="text-gray-500">{gramsText(c.chargeable_weight_g)}{c.payment_mode === 'cod' ? `, COD ${money(c.cod_amount)}` : ''}</div>
                    </Td>
                    <Td>{cancelled ? <Chip tone="red">Cancelled</Chip> : <span className="text-xs">{gsStatusText(c.board_status || c.status)}</span>}</Td>
                    <Td num>{s ? money(s.freight) : '...'}</Td>
                    <Td num>{s ? money(s.cod) : '...'}</Td>
                    <Td num>{s ? money(s.rto) : '...'}</Td>
                    <Td num>{s ? money(s.other) : '...'}</Td>
                    <Td num>{money(c.gst)}</Td>
                    <Td num>{money(c.sell_with_gst)}</Td>
                    <Td num className={changed ? 'font-semibold text-amber-800' : 'font-semibold'}>{money(fin)}</Td>
                  </Tr>
                );
              })}
            </TBody>
          </table>
        </TableShell>
        {all.length > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 text-sm">
            <span className="text-gray-500">Page {page} of {pages}, {all.length} parcels</span>
            <div className="flex gap-2">
              <Btn variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Btn>
              <Btn variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Btn>
            </div>
          </div>
        )}
      </SectionCard>
    </Page>
  );
};

export default GrowshipBilling;
