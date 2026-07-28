import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import { Page, PageHeader, TableShell, THead, Th, TBody, Tr, Td, EmptyRow } from '../../components/erp';
import { ShieldCheck, ShieldAlert } from 'lucide-react';

/** Companies Act Rule 3(1) audit trail: hash-chain verification + recent entries. */
const AuditTrail: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/accounting/audit/verify')
      .then((r) => setData(payload(r)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Page>
      <PageHeader
        title="Audit Trail"
        description="Tamper-evident hash chain (Companies Act Rule 3(1)). Every entry links to the previous one — editing or deleting history breaks the chain and shows up here."
      />

      {loading && <div className="text-sm text-gray-500">Verifying chain…</div>}
      {data && (
        <>
          <div className={`flex items-center gap-2 rounded-xl border p-4 font-semibold ${data.verification.ok ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-red-300 bg-red-50 text-red-800'}`}>
            {data.verification.ok ? <ShieldCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
            {data.verification.ok
              ? `Chain intact — ${data.verification.checked} entries verified.`
              : `CHAIN BROKEN at entry #${data.verification.brokenAtSeq} — this is a reportable incident (invariant I14).`}
          </div>

          <TableShell>
            <table className="w-full text-sm">
              <THead>
                <Th>#</Th><Th>Actor</Th><Th>Action</Th><Th>Entity</Th><Th>When</Th>
              </THead>
              <TBody>
                {data.recent.length === 0 && <EmptyRow colSpan={5}>No audit entries yet.</EmptyRow>}
                {data.recent.map((e: any) => (
                  <Tr key={e.seq}>
                    <Td className="font-mono">{e.seq}</Td>
                    <Td className="capitalize">{e.actor_type}</Td>
                    <Td>{e.action}</Td>
                    <Td>{e.entity_type}{e.entity_id ? ` · ${String(e.entity_id).slice(0, 12)}` : ''}</Td>
                    <Td muted>{new Date(e.occurred_at).toLocaleString('en-IN')}</Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableShell>
        </>
      )}
    </Page>
  );
};

export default AuditTrail;
