import { useState } from 'react';
import { v2call } from '../../lib/v2/http';

/**
 * Asks the store's connected distributor ERP for stock that changed since the
 * last fetch. The ERP is theirs; this only updates this store's copy.
 */
export default function FetchFromErpButton({ onDone, className }: { onDone?: () => void; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ bad: boolean; text: string } | null>(null);

  const run = async () => {
    setBusy(true);
    setNote(null);
    try {
      const connections = await v2call<Array<{ id: string; label?: string; enabled?: boolean; feeds?: Array<{ key: string; enabled?: boolean }> }>>('GET', '/api/v2/erp/connections');
      const list = Array.isArray(connections) ? connections : [];
      const connection = list.find((c) => c.enabled !== false && (c.feeds ?? []).some((f) => f.key === 'inventory' && f.enabled !== false))
        ?? list.find((c) => (c.feeds ?? []).some((f) => f.key === 'inventory'));
      if (!connection) {
        setNote({ bad: true, text: 'No ERP is connected for this store yet.' });
        return;
      }
      const out = await v2call<{ status?: string; message?: string; rows_fetched?: number; records_changed?: number }>(
        'POST', `/api/v2/erp/connections/${connection.id}/feeds/inventory/sync`, { data: {} },
      );
      if (out?.status && out.status !== 'ok') {
        setNote({ bad: true, text: out.message || 'The ERP stock fetch did not finish.' });
        return;
      }
      const read = out?.rows_fetched ?? 0;
      const changed = out?.records_changed ?? 0;
      setNote({ bad: false, text: `Fetched from ${connection.label || 'the ERP'}: ${read.toLocaleString()} read, ${changed.toLocaleString()} changed.` });
      onDone?.();
    } catch (err: any) {
      setNote({ bad: true, text: err?.response?.data?.message || err?.message || 'Could not fetch stock from the ERP.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" className={className ?? 'btn btn-secondary'} onClick={() => void run()} disabled={busy} data-testid="inv-fetch-erp"
        title="Ask this store's connected ERP for stock that changed since the last fetch">
        {busy ? 'Fetching…' : 'Fetch from ERP'}
      </button>
      {note && <span className={note.bad ? 'text-sm text-red-700' : 'text-sm text-emerald-700'}>{note.text}</span>}
    </span>
  );
}
