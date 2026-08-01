import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import { useAuth } from '../../contexts/AuthContext';
import { Page, PageHeader, Btn, Field, TextInput, ExportMenu, EmptyState } from '../../components/erp';
import type { CsvColumn } from '../../components/erp';
import { ShieldAlert, ShieldCheck, Info } from 'lucide-react';

const badge: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-300',
  warning: 'bg-amber-100 text-amber-800 border-amber-300',
  info: 'bg-emerald-100 text-emerald-800 border-emerald-300',
};

interface Finding {
  code: string;
  severity: 'critical' | 'warning' | 'info' | string;
  message: string;
  statutoryRef?: string;
}
interface RateCheckData {
  asOf: string;
  findings: Finding[];
}

const today = () => new Date().toISOString().slice(0, 10);

const CSV_COLS: CsvColumn<Finding>[] = [
  { key: 'severity', label: 'Severity' },
  { key: 'code', label: 'Code' },
  { key: 'message', label: 'Finding' },
  { key: 'statutoryRef', label: 'Source' },
];

const RateCheck: React.FC = () => {
  const { hasPerm } = useAuth();
  const canRead = hasPerm('gst.read');

  const [asOf, setAsOf] = useState(today());
  const [data, setData] = useState<RateCheckData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // DEFECT FIX: this used to `.catch(() => {})`, so a failed call left the page
  // stuck on "Checking…" forever with no clue. Now failures surface as an error
  // banner and the loading flag always clears.
  const load = useCallback(async (date = asOf) => {
    if (!canRead) return;
    setLoading(true); setError('');
    try {
      setData(payload<RateCheckData>(await api.get('/accounting/gst/rate-check', { params: { asOf: date } })));
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? 'Could not run the rate check. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [asOf, canRead]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const findings = data?.findings ?? [];

  return (
    <Page>
      <PageHeader
        title="GST Rate Check"
        description={<>Store tax configuration vs the statutory rules registry{data ? ` (as of ${data.asOf})` : ''}.
          Findings are for you and your CA — nothing is changed automatically.</>}
        actions={
          <div className="flex items-end gap-2">
            <Field label="Check rates as on">
              <TextInput type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} disabled={!canRead} />
            </Field>
            <Btn onClick={() => load(asOf)} disabled={!canRead || loading}>{loading ? 'Checking…' : 'Recompute'}</Btn>
            <ExportMenu
              filename={`gst-rate-check-${data?.asOf ?? asOf}`}
              columns={CSV_COLS}
              rows={findings}
              canExport={canRead}
              disabled={!data}
            />
          </div>
        }
      />

      {!canRead && (
        <EmptyState title="No access" description="You need the gst.read permission to view GST rate-check findings." />
      )}

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Couldn’t run the rate check.</strong> {error}
        </div>
      )}

      {canRead && (
        <div className="space-y-3">
          {loading && !data && <div className="text-sm text-gray-500">Checking…</div>}
          {!loading && !error && data && findings.length === 0 && (
            <EmptyState title="No findings" description="Your tax configuration matches the statutory rules registry for this date." />
          )}
          {findings.map((f) => (
            <div key={f.code + f.message.slice(0, 20)} className={`rounded-lg border p-4 ${badge[f.severity] ?? badge.info}`}>
              <div className="flex items-center gap-2 font-semibold">
                {f.severity === 'critical' ? <ShieldAlert className="h-5 w-5" />
                  : f.severity === 'warning' ? <Info className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
                <span className="uppercase text-xs tracking-wide">{f.severity}</span>
                <span className="font-mono text-xs">{f.code}</span>
              </div>
              <p className="mt-1 text-sm">{f.message}</p>
              {f.statutoryRef && <p className="mt-1 text-xs opacity-75">Source: {f.statutoryRef}</p>}
            </div>
          ))}
        </div>
      )}
    </Page>
  );
};

export default RateCheck;
