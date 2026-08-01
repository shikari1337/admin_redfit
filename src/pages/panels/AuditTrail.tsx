import React, { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, ShieldAlert, RefreshCw, AlertTriangle } from 'lucide-react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import { useAuth } from '../../contexts/AuthContext';
import { formatDate } from '../../utils/date';
import {
  Page, PageHeader, Btn, FilterBar, Field, SearchInput, SelectInput, ExportMenu,
  Pagination, useListControls, TableShell, THead, Th, TBody, Tr, Td, EmptyRow,
  type CsvColumn,
} from '../../components/erp';

/**
 * Companies Act Rule 3(1) audit trail: hash-chain verification + recent entries.
 *
 * The backend returns the latest 50 entries with no server-side filter or
 * pagination, so search / actor filter / paging here operate CLIENT-SIDE over
 * those 50 rows, and Export CSV downloads exactly what is on screen.
 */

interface AuditEntry {
  seq: number; actor_type: string; action: string;
  entity_type: string; entity_id: string | null; occurred_at: string;
}
interface VerifyResult { ok: boolean; checked: number; brokenAtSeq?: number | null; }

const cols: CsvColumn<AuditEntry>[] = [
  { key: 'seq', label: '#' },
  { key: 'actor_type', label: 'Actor' },
  { key: 'action', label: 'Action' },
  { key: 'entity_type', label: 'Entity type' },
  { key: 'entity_id', label: 'Entity id' },
  { key: 'occurred_at', label: 'When', format: (r) => formatDate(r.occurred_at, 'dd MMM yyyy HH:mm:ss') },
];

const AuditTrail: React.FC = () => {
  const { hasPerm } = useAuth();
  const [verification, setVerification] = useState<VerifyResult | null>(null);
  const [recent, setRecent] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actor, setActor] = useState('');

  const lc = useListControls({ pageSize: 15 });

  const load = () => {
    setLoading(true); setError('');
    api.get('/accounting/audit/verify')
      .then((r) => {
        const d = payload<{ verification: VerifyResult; recent: AuditEntry[] }>(r);
        setVerification(d?.verification ?? null);
        setRecent(d?.recent ?? []);
      })
      .catch((e: any) => setError(e?.response?.data?.message ?? e?.message ?? 'Could not verify the audit chain.'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const actors = useMemo(
    () => Array.from(new Set(recent.map((e) => e.actor_type).filter(Boolean))).sort(),
    [recent],
  );

  const filtered = useMemo(() => {
    const q = lc.debouncedSearch.trim().toLowerCase();
    return recent.filter((e) => {
      if (actor && e.actor_type !== actor) return false;
      if (!q) return true;
      return [e.actor_type, e.action, e.entity_type, e.entity_id, String(e.seq)]
        .some((v) => String(v ?? '').toLowerCase().includes(q));
    });
  }, [recent, lc.debouncedSearch, actor]);

  const pageRows = filtered.slice((lc.page - 1) * lc.pageSize, lc.page * lc.pageSize);

  return (
    <Page>
      <PageHeader
        title="Audit Trail"
        description="Tamper-evident hash chain (Companies Act Rule 3(1)). Every entry links to the previous one — editing or deleting history breaks the chain and shows up here. Latest 50 entries."
        actions={
          <div className="flex items-center gap-2">
            <ExportMenu filename="audit-trail" columns={cols} rows={filtered} canExport={hasPerm('audit.read')} disabled={loading} />
            <Btn variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={loading ? 'animate-spin' : undefined} /> Re-verify
            </Btn>
          </div>
        }
      />

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{error}</span>
        </div>
      )}

      {loading && <div className="text-sm text-gray-500">Verifying chain…</div>}

      {!loading && verification && (
        <div className={`flex items-center gap-2 rounded-xl border p-4 font-semibold ${verification.ok ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-red-300 bg-red-50 text-red-800'}`}>
          {verification.ok ? <ShieldCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
          {verification.ok
            ? `Chain intact — ${verification.checked} entries verified.`
            : `CHAIN BROKEN at entry #${verification.brokenAtSeq} — this is a reportable incident (invariant I14).`}
        </div>
      )}

      {!loading && (
        <>
          <FilterBar>
            <Field label="Search">
              <SearchInput
                value={lc.search}
                onChange={(e) => lc.setSearch(e.target.value)}
                placeholder="Actor, action, entity, id…"
                className="w-72"
              />
            </Field>
            <Field label="Actor">
              <SelectInput value={actor} onChange={(e) => { setActor(e.target.value); lc.setPage(1); }}>
                <option value="">All actors</option>
                {actors.map((a) => <option key={a} value={a}>{a}</option>)}
              </SelectInput>
            </Field>
          </FilterBar>

          <TableShell>
            <table className="w-full text-sm">
              <THead>
                <Th>#</Th><Th>Actor</Th><Th>Action</Th><Th>Entity</Th><Th>When</Th>
              </THead>
              <TBody>
                {filtered.length === 0 && (
                  <EmptyRow colSpan={5}>{recent.length === 0 ? 'No audit entries yet.' : 'No entries match your filters.'}</EmptyRow>
                )}
                {pageRows.map((e) => (
                  <Tr key={e.seq}>
                    <Td className="font-mono">{e.seq}</Td>
                    <Td className="capitalize">{e.actor_type}</Td>
                    <Td>{e.action}</Td>
                    <Td>{e.entity_type}{e.entity_id ? ` · ${String(e.entity_id).slice(0, 12)}` : ''}</Td>
                    <Td muted>{formatDate(e.occurred_at, 'dd MMM yyyy HH:mm:ss')}</Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableShell>

          <Pagination
            page={lc.page}
            pageSize={lc.pageSize}
            total={filtered.length}
            onPage={lc.setPage}
            onPageSize={lc.setPageSize}
          />
        </>
      )}
    </Page>
  );
};

export default AuditTrail;
