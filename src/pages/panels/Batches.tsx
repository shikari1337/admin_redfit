import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { Page, PageHeader, TableShell, THead, Th, TBody, Td, EmptyRow, StatusChip, TextInput } from '../../components/erp';

/** Batches & expiry (pharma): FEFO order, near-expiry highlighting. */
const Batches: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [nearOnly, setNearOnly] = useState(false);
  const [days, setDays] = useState(90);
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      const res = await api.get('/purchasing/batches', {
        params: nearOnly ? { nearExpiryDays: days } : {},
      });
      setRows(res.data.rows ?? []);
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };
  useEffect(() => { load(); }, [nearOnly, days]);

  const expiryClass = (d: number | null) =>
    d === null ? '' : d < 0 ? 'bg-red-100 text-red-800'
    : d <= 30 ? 'bg-red-50 text-red-700'
    : d <= 90 ? 'bg-amber-50 text-amber-800' : '';

  return (
    <Page>
      <PageHeader
        title="Batches & Expiry"
        description="Batches are consumed FEFO (first-expiry-first-out); expired batches are never allocated. Capture batch/expiry/MRP while receiving goods in Purchasing."
        actions={
          <div className="flex items-end gap-2 text-sm">
            <label className="flex items-center gap-1.5 text-gray-700">
              <input type="checkbox" checked={nearOnly} onChange={(e) => setNearOnly(e.target.checked)} />
              Near expiry within
            </label>
            <TextInput type="number" min={0} value={days} onChange={(e) => setDays(parseInt(e.target.value) || 0)}
              disabled={!nearOnly} className="w-20 text-right" />
            <span className="text-gray-700">days</span>
          </div>
        }
      />
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <TableShell>
        <table className="w-full text-sm">
          <THead>
            <Th>Product</Th><Th>SKU</Th><Th>Batch</Th><Th num>Qty</Th>
            <Th>Expiry</Th><Th num>Days left</Th><Th num>MRP</Th><Th>Status</Th>
          </THead>
          <TBody>
            {rows.length === 0 && (
              <EmptyRow colSpan={8}>
                {nearOnly ? `No batches expiring within ${days} days.` : 'No batches yet — capture them when receiving goods.'}
              </EmptyRow>
            )}
            {rows.map((b: any) => (
              <tr key={b.id} className={expiryClass(b.days_to_expiry)}>
                <Td>{b.product_name}</Td>
                <Td className="font-mono text-xs">{b.sku}</Td>
                <Td className="font-mono">{b.batch_number}</Td>
                <Td num>{b.qty_on_hand}</Td>
                <Td>{b.expiry_date ?? '—'}</Td>
                <Td num>{b.days_to_expiry ?? '—'}</Td>
                <Td num>{b.mrp != null ? `₹${Number(b.mrp).toFixed(2)}` : '—'}</Td>
                <Td><StatusChip status={b.status} /></Td>
              </tr>
            ))}
          </TBody>
        </table>
      </TableShell>
    </Page>
  );
};

export default Batches;
