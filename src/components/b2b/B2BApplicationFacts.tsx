import React from 'react';
import { AttachmentPanel } from '@/components/erp';
import { ErrorNote, Loading, Notice, useLoad } from '@/pages/panels/erp/shared';
import { codeLabel } from '@/lib/v2/appSettings';
import { getApplicationFacts } from '@/lib/v2/business';

/**
 * What the app adds to a business application (HMAPP-T6 B11 (a) and (c); design 60 AD09): the drug
 * licence number as typed, the GSTIN check the backend made with its SOURCE, the channel, and the
 * licence photo or PDF (Commerce attachments of record `b2b_application/<customer_id>`, private,
 * opened by a signed link). GSTN itself is not asked yet (a licensed path is an owner item), so a
 * person checks every application.
 *
 * Server (Trade): `GET /api/v2/trade/applications/{id}/app-facts` (`b2b.read`). Not on the live
 * server yet: the section says so and the rest of the application still shows.
 */
const B2BApplicationFacts: React.FC<{ applicationId: string; customerId: string }> = ({ applicationId, customerId }) => {
  const facts = useLoad(() => getApplicationFacts(applicationId), [applicationId]);
  const f = facts.data;
  const g = f?.gstin_check ?? null;

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">From the app</h3>
      {facts.loading && !f ? <Loading label="Reading the application's checks" /> : facts.error ? (
        <ErrorNote error={facts.error} what="The app's application checks" />
      ) : f ? (
        <dl className="space-y-1.5 text-sm">
          <div className="grid grid-cols-[8.5rem_1fr] gap-3"><dt className="text-gray-500">Sent from</dt><dd>{f.channel ? codeLabel(f.channel) : 'not recorded'}</dd></div>
          <div className="grid grid-cols-[8.5rem_1fr] gap-3"><dt className="text-gray-500">Drug licence</dt><dd className="font-mono text-xs leading-5">{f.licence_number ?? 'not given'}</dd></div>
          <div className="grid grid-cols-[8.5rem_1fr] gap-3">
            <dt className="text-gray-500">GSTIN check</dt>
            <dd className="space-y-1">
              {!g ? 'not made' : (
                <>
                  <div className={g.valid ? 'text-emerald-700' : 'text-red-700'}>
                    {g.valid ? 'The GSTIN is well formed' : `Not valid${g.reason ? `: ${g.reason}` : ''}`}
                  </div>
                  {g.state && <div>State: {g.state}{g.state_code ? ` (${g.state_code})` : ''}</div>}
                  {g.source && <div className="text-xs text-gray-500">Checked against: {g.source}</div>}
                  {g.gstn === 'not_checked' && <div className="text-xs text-amber-800">GSTN was not asked. Check the legal name yourself before approving.</div>}
                </>
              )}
            </dd>
          </div>
        </dl>
      ) : null}
      {f ? (
        <AttachmentPanel entityType="b2b_application" entityId={customerId} readOnly title="Licence photo or PDF"
          description="Sent by the applicant. Opens by a link that works for a short time." />
      ) : null}
      {f && !f.licence_number && <Notice tone="info">No licence number was sent with this application.</Notice>}
    </section>
  );
};

export default B2BApplicationFacts;
